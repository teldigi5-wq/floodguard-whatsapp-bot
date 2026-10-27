'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Local records may contain subscriber identifiers and alert history.
// Never log their data, content excerpts, or absolute paths on read failures.
const DATA_PATH = process.env.DATA_PATH || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_PATH, { recursive: true, mode: 0o700 });
const file = name => path.join(DATA_PATH, name);

function readJson(name, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file(name), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
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

function writeJson(name, value) {
  // A unique, exclusive, owner-only staging file avoids collisions and
  // predictable .tmp symlink attacks. Never use a temp file as a bootstrap
  // fallback: only a successfully renamed canonical record is authoritative.
  const temporary = file(name + '.' + randomUUID() + '.tmp');
  let fd;
  let staged = false;
  try {
    const serialized = JSON.stringify(value, null, 2);
    fd = fs.openSync(temporary, 'wx', 0o600);
    staged = true;
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    // Atomic within a supported same-directory filesystem. A sudden power
    // loss still requires its own device/filesystem-specific recovery tests.
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
    throw new Error('FloodGuard local write failed for ' + name + '; inspect private storage and backup.');
  }
}

function getSubscribers() {
  const data = readJson('subscribers.json', []);
  if (!Array.isArray(data) ||
      data.some(jid => typeof jid !== 'string' || !jid.trim() || jid.length > 512)) {
    throw new Error('Invalid FloodGuard subscriber store; manual private recovery required.');
  }
  return new Set(data);
}

function subscribe(jid) {
  const subscribers = getSubscribers();
  subscribers.add(jid);
  writeJson('subscribers.json', [...subscribers]);
}

function unsubscribe(jid) {
  const subscribers = getSubscribers();
  subscribers.delete(jid);
  writeJson('subscribers.json', [...subscribers]);
}

function getState() {
  const state = readJson('state.json', {
    initialized: false, level: 'UNKNOWN', gateStatus: 'UNKNOWN',
    procedureId: null, sentCountdown: []
  });
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
