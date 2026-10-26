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
    failedAttempts: 0, exhausted: 0, expired: 0, superseded: 0, ambiguous: 0 };
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
    j.expiresAt <= j.sourceAt + MAX_TTL_MS &&
    (j.inFlight === undefined || typeof j.inFlight === 'boolean')), 'invalid stored job');
  required(data.recentKeys.every(k => typeof k === 'string' && k.length <= 100), 'invalid stored dedupe key');
  required(data.ambiguous === undefined ||
    (Number.isSafeInteger(data.ambiguous) && data.ambiguous >= 0),
    'invalid ambiguous delivery counter');
  data.ambiguous ??= 0; // Supports valid stores written before this stage.
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

function createVirtualOutbox({ dataDir, now = Date.now, exclusive = false }) {
  required(typeof dataDir === 'string' && dataDir.length > 0, 'private data directory required');
  required(typeof now === 'function', 'clock function required');
  required(typeof exclusive === 'boolean', 'invalid exclusive-owner setting');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, FILE);
  const ownerFile = path.join(dataDir, 'alert-outbox-v1.owner');
  const token = exclusive ? randomUUID() : null;
  let closed = false;

  // Optional cross-process fence. Creation is atomic; a crash leaves the
  // private owner file, and a new owner must NOT steal it automatically.
  if (token) {
    let created = false;
    try {
      const fd = fs.openSync(ownerFile, 'wx', 0o600);
      created = true;
      try {
        fs.writeFileSync(fd, token);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      if (created) {
        try { fs.unlinkSync(ownerFile); } catch {}
      }
      throw new Error('Offline alert outbox: exclusive owner is locked or unavailable');
    }
  } else required(!fs.existsSync(ownerFile), 'exclusive owner is locked');

  function ensureOwner() {
    required(!closed, 'owner already closed');
    if (token) {
      let current;
      try { current = fs.readFileSync(ownerFile, 'utf8'); }
      catch { throw new Error('Offline alert outbox: exclusive owner lost'); }
      required(current === token, 'exclusive owner lost');
    } else required(!fs.existsSync(ownerFile), 'exclusive owner is locked');
  }
  let data;
  try { data = load(filename); }
  catch (error) {
    // Release only the lock created by this constructor when startup fails.
    if (token) {
      try { if (fs.readFileSync(ownerFile, 'utf8') === token) fs.unlinkSync(ownerFile); }
      catch {}
    }
    throw error;
  }
  function persist() {
    ensureOwner();
    save(filename, data);
  }

  // A process can die after a remote send was accepted, but before local
  // acknowledgement was committed. Do NOT replay in-flight attempts.
  const uncertainFromCrash = data.pending.filter(j => j.inFlight === true).length;
  if (uncertainFromCrash) {
    data.pending = data.pending.filter(j => j.inFlight !== true);
    data.ambiguous += uncertainFromCrash;
    persist();
  }
  const verifiedThisProcess = new Map();
  let draining = false;

  function prune(time) {
    const old = data.pending.length;
    data.pending = data.pending.filter(j => j.expiresAt > time && time - j.sourceAt < MAX_TTL_MS);
    const removed = old - data.pending.length;
    data.expired += removed;
    return removed;
  }
  function observe(o) {
    ensureOwner();
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
    persist();
    return true;
  }
  function enqueue({ key, topic, sourceAt, phase, recipients, text, ttlMs = 7000 }) {
    ensureOwner();
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
      expiresAt,attempts:0,nextAttemptAt:now(),inFlight:false});
    data.recentKeys.push(key);
    if (data.recentKeys.length > MAX_RECENT_KEYS) data.recentKeys.splice(0, data.recentKeys.length - MAX_RECENT_KEYS);
    persist();
    return true;
  }
  async function drain({ observation, authorizedRecipients, send, sendTimeoutMs = 3000 }) {
    ensureOwner();
    required(!draining, 'concurrent outbox drains are refused');
    required(Number.isSafeInteger(sendTimeoutMs) && sendTimeoutMs >= 1 &&
      sendTimeoutMs <= 5000, 'bounded send timeout must be 1-5000 milliseconds');
    required(typeof send === 'function', 'synthetic send callback required');
    required(authorizedRecipients instanceof Set && authorizedRecipients.size <= 10000,
      'current subscriber allowlist required');
    validateObservation(observation, now());
    const saved = data.observations[observation.topic];
    required(saved && saved.sourceAt === observation.sourceAt && saved.phase === observation.phase &&
      verifiedThisProcess.get(observation.topic) === observation.sourceAt + ':' + observation.phase,
      'newly verified observation required to drain');
    draining = true;
    const report = {attempted:0,accepted:0,failed:0,ambiguous:0,expired:0,removed:0,pending:0};
    try {
      report.expired += prune(now());
      for (const job of [...data.pending]) {
        // Observe() may supersede a queued warning while an earlier fake
        // send is pending. Never use stale snapshot jobs after an await.
        ensureOwner();
        if (!data.pending.includes(job)) continue;
        const mostRecent = data.observations[job.topic];
        if (!mostRecent || mostRecent.sourceAt !== job.sourceAt ||
            mostRecent.phase !== job.phase) {
          data.pending = data.pending.filter(j => j !== job);
          data.superseded++;
          persist();
          continue;
        }
        if (job.topic !== observation.topic) continue;
        if (job.sourceAt !== observation.sourceAt || job.phase !== observation.phase ||
          !authorizedRecipients.has(job.recipient) || job.expiresAt <= now() ||
          now() - job.sourceAt >= MAX_TTL_MS) {
          data.pending = data.pending.filter(j => j !== job);
          if (job.expiresAt <= now() || now() - job.sourceAt >= MAX_TTL_MS) {
            data.expired++;
            report.expired++;
          } else report.removed++;
          persist();
          continue;
        }
        if (now() < job.nextAttemptAt) continue;
        job.attempts++;
        // Persist in-flight state BEFORE invoking an untrusted sender.
        // Restart quarantines it, avoiding automatic ambiguous replay.
        job.inFlight = true;
        persist();
        report.attempted++;
        const controller = new AbortController();
        let timeout;
        let timedOut = false;
        try {
          await Promise.race([
            // Invoke the approved synthetic sender immediately after the
            // freshness/ownership checks. Deferring invocation to a microtask
            // could let a newer SAFE snapshot arrive before an old DANGER send.
            Promise.resolve(send(job.recipient, job.text, { signal: controller.signal })),
            new Promise((_, reject) => {
              timeout = setTimeout(() => {
                timedOut = true;
                controller.abort(); // Best-effort: remote delivery may already have occurred.
                reject(new Error('Synthetic sender timed out'));
              }, sendTimeoutMs);
            })
          ]);
          data.pending = data.pending.filter(j => j !== job);
          report.accepted++;
        } catch {
          if (timedOut) {
            // Outcome unknown. Quarantine, do not automatically retry.
            data.pending = data.pending.filter(j => j !== job);
            data.ambiguous++;
            report.ambiguous++;
          } else {
            data.failedAttempts++;
            report.failed++;
            job.inFlight = false;
            if (job.attempts >= MAX_ATTEMPTS) {
              data.pending = data.pending.filter(j => j !== job);
              data.exhausted++;
            } else job.nextAttemptAt = now() + Math.min(1000 * 2 ** (job.attempts-1), 5000);
          }
        } finally {
          clearTimeout(timeout);
        }
        persist();
      }
      report.pending = data.pending.length;
      return report;
    } finally { draining = false; }
  }
  function summary() {
    ensureOwner();
    const { failedAttempts, exhausted, expired, superseded, ambiguous, pending } = data;
    return { pending: pending.length, failedAttempts, exhausted, expired, superseded, ambiguous };
  }
  function close() {
    if (closed) return;
    ensureOwner();
    // Releasing an exclusive owner during a suspended remote send permits
    // a second worker to open the same queue and double-dispatch.
    required(!draining, 'cannot close exclusive owner while drain is active');
    if (token) {
      try { fs.unlinkSync(ownerFile); }
      catch { throw new Error('Offline alert outbox: exclusive owner release failed'); }
    }
    closed = true;
  }
  return Object.freeze({ observe, enqueue, drain, summary, close });
}
module.exports = { createVirtualOutbox };
