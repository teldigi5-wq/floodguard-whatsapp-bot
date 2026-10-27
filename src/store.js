'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Local records may contain subscriber identifiers and alert history.
// Never log their data, content excerpts, or absolute paths on read failures.
const DATA_PATH = process.env.DATA_PATH || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_PATH, { recursive: true, mode: 0o700 });
const file = name => path.join(DATA_PATH, name);
const MAX_SUBSCRIBERS = 512;
const MAX_SUBSCRIBER_BYTES = 128 * 1024;
// Match the supported Baileys chat identities (individual, LID or group).
// Do not allow newlines/control characters, arbitrary domains or status
// broadcast identifiers to enter persistent delivery records.
function validSubscriberJid(jid) {
  return typeof jid === 'string' &&
    /^[A-Za-z0-9._:+-]{1,128}@(s\.whatsapp\.net|lid|g\.us)$/.test(jid);
}
function requireSubscriberJid(jid) {
  if (!validSubscriberJid(jid)) {
    throw new Error('Invalid FloodGuard subscriber recipient; no change persisted.');
  }
}

function readJson(name, fallback) {
  let raw;
  try {
    if (name === 'subscribers.json') {
      const bytes = fs.statSync(file(name)).size;
      if (!Number.isSafeInteger(bytes) || bytes > MAX_SUBSCRIBER_BYTES) {
        throw new Error('Oversized FloodGuard subscriber store');
      }
    }
    raw = fs.readFileSync(file(name), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    if (name === 'subscribers.json' && error?.message === 'Oversized FloodGuard subscriber store') {
      throw new Error('Invalid FloodGuard subscriber store: oversized private data; manual recovery required.');
    }
    throw new Error('Unreadable FloodGuard local ' + name + '; inspect the private backup.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Preserve corrupt files. Treating a syntax error as an empty subscriber
    // list could silently suppress all future notification delivery.
    throw new Error('Corrupt FloodGuard local ' + name + '; restore from private backup.');
  }
}

// One-way independent marker: losing the canonical state after any recorded
// transition is a safety incident, never permission to start a fresh baseline.
// A missing marker + existing state is supported for migration from older
// installations. A missing marker + missing state is ONLY for explicit offline
// bootstrap/tests; processLiveChange always calls getState() first and fails.
const STATE_MARKER = file('state.ever-recorded');
function privateRegularFileStatus(filename) {
  try {
    const metadata = fs.lstatSync(filename);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Invalid private state record');
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new Error('FloodGuard private state record unavailable; manual recovery required.');
  }
}
function ensureStateRecordedMarker() {
  const canonicalExists = privateRegularFileStatus(file('state.json'));
  const markerExists = privateRegularFileStatus(STATE_MARKER);
  if (!canonicalExists && markerExists) {
    throw new Error('FloodGuard alert state missing after previous recording; manual recovery required.');
  }
  if (!markerExists) {
    // Before any canonical replacement, persist a small, owner-only marker.
    // Never delete it automatically, including after failed writes/restarts.
    let fd;
    try {
      fd = fs.openSync(STATE_MARKER, 'wx', 0o600);
      fs.writeSync(fd, 'floodguard-state-recorded-v1\n');
      fs.fsyncSync(fd);
    } catch {
      throw new Error('FloodGuard private state marker unavailable; manual recovery required.');
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    }
  }
  return canonicalExists;
}

// The subscribers file must not become an empty list on unexpected loss:
// doing so would silently suppress warnings for previously enrolled people.
// An absent file is permitted ONLY before any enrollment has been persisted.
const SUBSCRIBER_MARKER = file('subscribers.ever-recorded');
function ensureSubscribersRecordedMarker(forInitialWrite = false) {
  let canonicalExists, markerExists;
  try {
    canonicalExists = privateRegularFileStatus(file('subscribers.json'));
    markerExists = privateRegularFileStatus(SUBSCRIBER_MARKER);
  } catch {
    // Keep private filesystem errors redacted while identifying which
    // durable record needs an operator's consent-safe restoration.
    throw new Error('FloodGuard subscriber private record unavailable; manual recovery required.');
  }
  if (!canonicalExists && markerExists) {
    throw new Error('FloodGuard subscriber store missing after previous recording; manual recovery required.');
  }
  if (!markerExists && (canonicalExists || forInitialWrite)) {
    let fd;
    try {
      fd = fs.openSync(SUBSCRIBER_MARKER, 'wx', 0o600);
      fs.writeSync(fd, 'floodguard-subscribers-recorded-v1\n');
      fs.fsyncSync(fd);
    } catch {
      throw new Error('FloodGuard subscriber record marker unavailable; manual recovery required.');
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    }
  }
  return canonicalExists;
}

function writeJson(name, value) {
  // A unique, exclusive, owner-only staging file avoids collisions and
  // predictable .tmp symlink attacks. Never use a temp file as a bootstrap
  // fallback: only a successfully renamed canonical record is authoritative.
  const temporary = file(name + '.' + randomUUID() + '.tmp');
  let fd;
  let staged = false;
  try {
    const priorStateExists = name === 'state.json'
      ? ensureStateRecordedMarker() : false;
    const priorSubscribersExist = name === 'subscribers.json'
      ? ensureSubscribersRecordedMarker(true) : false;
    const serialized = JSON.stringify(value, null, 2);
    fd = fs.openSync(temporary, 'wx', 0o600);
    staged = true;
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // Atomic within a supported same-directory filesystem. A sudden power
    // loss still requires its own device/filesystem-specific recovery tests.
    // If another actor removed the canonical state while a send/write was in
    // flight, never silently recreate it and erase a lost quarantine.
    if (name === 'state.json' && priorStateExists &&
        !privateRegularFileStatus(file('state.json'))) {
      throw new Error('FloodGuard alert state disappeared during write');
    }
    if (name === 'subscribers.json' && priorSubscribersExist &&
        !privateRegularFileStatus(file('subscribers.json'))) {
      throw new Error('FloodGuard subscriber store disappeared during write');
    }
    fs.renameSync(temporary, file(name));
  } catch {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    if (staged) {
      try { fs.unlinkSync(temporary); } catch {}
    }
    // Never print OS exceptions containing absolute private paths, bytes,
    // account names or transient secret-bearing filesystem diagnostics.
    throw new Error('FloodGuard local write failed for ' + name + '; manual recovery required.');
  }
}

function getSubscribers() {
  // Fail closed if a recorded list disappears or is replaced by a symlink.
  // Legacy canonical lists gain the independent marker before use.
  ensureSubscribersRecordedMarker();
  const data = readJson('subscribers.json', []);
  if (!Array.isArray(data) || data.length > MAX_SUBSCRIBERS ||
      data.some(jid => !validSubscriberJid(jid))) {
    throw new Error('Invalid FloodGuard subscriber capacity or recipient; manual private recovery required.');
  }
  return new Set(data);
}

function subscribe(jid) {
  requireSubscriberJid(jid);
  const subscribers = getSubscribers();
  if (subscribers.has(jid)) return; // Preserve idempotency without an extra disk write.
  if (subscribers.size >= MAX_SUBSCRIBERS) {
    throw new Error('FloodGuard subscriber capacity limit reached; enrollment refused.');
  }
  subscribers.add(jid);
  writeJson('subscribers.json', [...subscribers]);
}

function unsubscribe(jid) {
  requireSubscriberJid(jid);
  const subscribers = getSubscribers();
  if (!subscribers.has(jid)) return;
  subscribers.delete(jid);
  writeJson('subscribers.json', [...subscribers]);
}

function getState() {
  // Never fabricate an empty prior state: doing so could erase a previous
  // deliveryUncertain latch and permit future automatic warnings/replays.
  if (!privateRegularFileStatus(file('state.json'))) {
    throw new Error('Missing FloodGuard alert state; manual recovery required.');
  }
  // On upgrade from an older installation, record history BEFORE processing
  // another alert, not only after a send. The canonical state stays unchanged.
  ensureStateRecordedMarker();
  const state = readJson('state.json', undefined);
  if (state === undefined) {
    throw new Error('Missing FloodGuard alert state; manual recovery required.');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      typeof state.initialized !== 'boolean' ||
      typeof state.level !== 'string' || typeof state.gateStatus !== 'string' ||
      !Array.isArray(state.sentCountdown)) {
    throw new Error('Invalid FloodGuard alert state; manual private recovery required.');
  }
  return state;
}

function saveState(state) { writeJson('state.json', state); }

module.exports = { DATA_PATH, getSubscribers, subscribe, unsubscribe, getState, saveState };
