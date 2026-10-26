'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Local records may contain subscriber identifiers and alert history.
// Never log their data, content excerpts, or absolute paths on read failures.
const DATA_PATH = process.env.DATA_PATH || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_PATH, { recursive: true });
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
  // The old complete destination stays intact if writing the temporary file
  // fails (e.g. ENOSPC) before the atomic same-directory rename.
  const temporary = file(name + '.tmp');
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file(name));
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
