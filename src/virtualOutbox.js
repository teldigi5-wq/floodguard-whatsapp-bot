'use strict';

// Offline-first alert outbox core. Not wired into the live WhatsApp runtime.
// A caller must explicitly provide a fresh, verified observation and current
// subscriber allowlist on every drain; reopening a store never starts sends.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const FILE = 'alert-outbox-v1.json';
const TOPICS = new Set(['water', 'gate', 'sensor']);
const PHASES = new Set(['SAFE', 'WARNING', 'DANGER', 'SENSOR_ERROR', 'COUNTDOWN', 'OPEN', 'CLOSED']);
const MAX_PENDING = 128;
const MAX_RECIPIENTS = 32;
const MAX_RECENT_KEYS = 256;
const MAX_ATTEMPTS = 3;
const MAX_TTL_MS = 15_000;
const MAX_CLOCK_LEAD_MS = 5000;

function required(ok, detail) {
  if (!ok) throw new Error('Offline alert outbox: ' + detail);
}
function observedTime(ts, now) {
  required(Number.isSafeInteger(ts) && ts > 946684800000 &&
    ts >= now - MAX_TTL_MS && ts <= now + MAX_CLOCK_LEAD_MS,
  'field observation must be recent and use epoch milliseconds');
}
function validateObservation(o, now) {
  required(o && TOPICS.has(o.topic) && PHASES.has(o.phase), 'invalid observation category');
  observedTime(o.sourceAt, now);
}
function empty() {
  return { version: 1, observations: {}, pending: [], recentKeys: [],
    failedAttempts: 0, exhausted: 0, expired: 0, superseded: 0 };
}
function load(filename) {
  let raw;
  try { raw = fs.readFileSync(filename, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return empty();
    throw new Error('Offline alert outbox: private file cannot be read');
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('Offline alert outbox: corrupt private file'); }
  required(data && data.version === 1 && !Array.isArray(data) &&
    data.observations && typeof data.observations === 'object' && !Array.isArray(data.observations) &&
    Array.isArray(data.pending) && data.pending.length <= MAX_PENDING &&
    Array.isArray(data.recentKeys) && data.recentKeys.length <= MAX_RECENT_KEYS &&
    ['failedAttempts','exhausted','expired','superseded'].every(k =>
      Number.isSafeInteger(data[k]) && data[k] >= 0), 'invalid private file schema');
  required(Object.entries(data.observations).every(([k, v]) => TOPICS.has(k) &&
    v && PHASES.has(v.phase) && Number.isSafeInteger(v.sourceAt) && v.sourceAt > 946684800000),
    'invalid stored observation');
  required(data.pending.every(j => j && TOPICS.has(j.topic) && PHASES.has(j.phase) &&
    typeof j.key === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(j.key) &&
    typeof j.recipient === 'string' && /^[^\s@]{1,128}@s\.whatsapp\.net$/.test(j.recipient) &&
    typeof j.text === 'string' && j.text.length <= 1600 &&
    Number.isSafeInteger(j.sourceAt) && Number.isSafeInteger(j.expiresAt) &&
    Number.isSafeInteger(j.attempts) && j.attempts >= 0 && j.attempts < MAX_ATTEMPTS &&
    Number.isSafeInteger(j.nextAttemptAt) && j.expiresAt > j.sourceAt &&
    j.expiresAt <= j.sourceAt + MAX_TTL_MS), 'invalid stored job');
  required(data.recentKeys.every(k => typeof k === 'string' && k.length <= 100), 'invalid stored dedupe key');
  return data;
}
function save(filename, data) {
  const tmp = filename + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, filename); }
  catch {
    try { fs.unlinkSync(tmp); } catch {}
    throw new Error('Offline alert outbox: could not commit private file');
  }
}

function createVirtualOutbox({ dataDir, now = Date.now }) {
  required(typeof dataDir === 'string' && dataDir.length > 0, 'private data directory required');
  required(typeof now === 'function', 'clock function required');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, FILE);
  const data = load(filename);
  const verifiedThisProcess = new Map();
  let draining = false;

  function prune(time) {
    const old = data.pending.length;
    data.pending = data.pending.filter(j => j.expiresAt > time && time - j.sourceAt < MAX_TTL_MS);
    data.expired += old - data.pending.length;
  }
  function observe(o) {
    const t = now();
    validateObservation(o, t);
    const previous = data.observations[o.topic];
    if (previous && o.sourceAt < previous.sourceAt) return false;
    required(!previous || o.sourceAt !== previous.sourceAt || o.phase === previous.phase,
      'conflicting observation at equal field timestamp');
    data.observations[o.topic] = { sourceAt: o.sourceAt, phase: o.phase };
    verifiedThisProcess.set(o.topic, o.sourceAt + ':' + o.phase);
    prune(t);
    const before = data.pending.length;
    data.pending = data.pending.filter(j => j.topic !== o.topic ||
      (j.sourceAt === o.sourceAt && j.phase === o.phase));
    data.superseded += before - data.pending.length;
    save(filename, data);
    return true;
  }
  function enqueue({ key, topic, sourceAt, phase, recipients, text, ttlMs = 7000 }) {
    required(typeof key === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(key), 'invalid event key');
    required(typeof text === 'string' && text.length > 0 && text.length <= 1600,
      'message outside length limits');
    required(Number.isSafeInteger(ttlMs) && ttlMs >= 1000 && ttlMs <= MAX_TTL_MS,
      'TTL outside safety limits');
    required(Array.isArray(recipients) && recipients.length > 0 &&
      recipients.length <= MAX_RECIPIENTS &&
      recipients.every(r => typeof r === 'string' && /^[^\s@]{1,128}@s\.whatsapp\.net$/.test(r)),
      'invalid recipient list');
    required(new Set(recipients).size === recipients.length, 'duplicate recipients');
    validateObservation({ topic, sourceAt, phase }, now());
    const saved = data.observations[topic];
    required(saved && saved.sourceAt === sourceAt && saved.phase === phase &&
      verifiedThisProcess.get(topic) === sourceAt + ':' + phase,
      'matching fresh observation required before enqueue');
    prune(now());
    if (data.recentKeys.includes(key)) return false;
    required(data.pending.length + recipients.length <= MAX_PENDING, 'outbox capacity reached; alert NOT queued');
    const expiresAt = Math.min(now() + ttlMs, sourceAt + MAX_TTL_MS);
    required(expiresAt > now(), 'alert already stale');
    for (const recipient of recipients) data.pending.push({key,topic,sourceAt,phase,recipient,text,
      expiresAt,attempts:0,nextAttemptAt:now()});
    data.recentKeys.push(key);
    if (data.recentKeys.length > MAX_RECENT_KEYS) data.recentKeys.splice(0, data.recentKeys.length - MAX_RECENT_KEYS);
    save(filename, data);
    return true;
  }
  async function drain({ observation, authorizedRecipients, send }) {
    required(!draining, 'concurrent outbox drains are refused');
    required(typeof send === 'function', 'synthetic send callback required');
    required(authorizedRecipients instanceof Set && authorizedRecipients.size <= 10000,
      'current subscriber allowlist required');
    validateObservation(observation, now());
    const saved = data.observations[observation.topic];
    required(saved && saved.sourceAt === observation.sourceAt && saved.phase === observation.phase &&
      verifiedThisProcess.get(observation.topic) === observation.sourceAt + ':' + observation.phase,
      'newly verified observation required to drain');
    draining = true;
    const report = {attempted:0,accepted:0,failed:0,expired:0,removed:0,pending:0};
    try {
      prune(now());
      for (const job of [...data.pending]) {
        if (job.topic !== observation.topic) continue;
        if (job.sourceAt !== observation.sourceAt || job.phase !== observation.phase ||
          !authorizedRecipients.has(job.recipient) || job.expiresAt <= now() ||
          now() - job.sourceAt >= MAX_TTL_MS) {
          data.pending = data.pending.filter(j => j !== job);
          report.removed++;
          save(filename, data);
          continue;
        }
        if (now() < job.nextAttemptAt) continue;
        job.attempts++;
        // Persist attempt BEFORE invoking an untrusted remote send. A crash
        // after acceptance but before removal may still allow duplicates.
        save(filename, data);
        report.attempted++;
        try {
          await send(job.recipient, job.text);
          data.pending = data.pending.filter(j => j !== job);
          report.accepted++;
        } catch {
          data.failedAttempts++;
          report.failed++;
          if (job.attempts >= MAX_ATTEMPTS) {
            data.pending = data.pending.filter(j => j !== job);
            data.exhausted++;
          } else job.nextAttemptAt = now() + Math.min(1000 * 2 ** (job.attempts-1), 5000);
        }
        save(filename, data);
      }
      report.pending = data.pending.length;
      return report;
    } finally { draining = false; }
  }
  function summary() {
    const { failedAttempts, exhausted, expired, superseded, pending } = data;
    return { pending: pending.length, failedAttempts, exhausted, expired, superseded };
  }
  return Object.freeze({ observe, enqueue, drain, summary });
}
module.exports = { createVirtualOutbox };
