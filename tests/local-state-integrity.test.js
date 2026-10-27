'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'floodguard-corrupt-state-'));
process.env.DATA_PATH = folder;
const store = require('../src/store');
test.after(() => fs.rmSync(folder, { recursive: true, force: true }));

const file = name => path.join(folder, name);
const validState = {
  initialized: true,
  level: 'WARNING',
  gateStatus: 'CLOSED',
  procedureId: null,
  sentCountdown: [],
  lastSeenAt: 1234567
};

test('a missing file uses bootstrap defaults, but corrupt subscriber JSON must not silently erase recipients', () => {
  assert.deepEqual([...store.getSubscribers()], []);
  fs.writeFileSync(file('subscribers.json'), JSON.stringify(['test@s.whatsapp.net']));
  assert.deepEqual([...store.getSubscribers()], ['test@s.whatsapp.net']);
  fs.writeFileSync(file('subscribers.json'), '{truncated');
  assert.throws(() => store.getSubscribers(), /subscriber|invalid|corrupt|parse/i);
  // Corrupt state must stay untouched for manual recovery, not overwritten
  // with an empty subscriber set as if no one requested notifications.
  assert.equal(fs.readFileSync(file('subscribers.json'), 'utf8'), '{truncated');
});

test('malformed persisted subscriber types never become message recipients', () => {
  for (const content of [JSON.stringify({ recipient: 'test@s.whatsapp.net' }),
    JSON.stringify([false]), JSON.stringify([42]), JSON.stringify([''])]) {
    fs.writeFileSync(file('subscribers.json'), content);
    assert.throws(() => store.getSubscribers(), /subscriber|invalid|corrupt/i);
  }
  fs.writeFileSync(file('subscribers.json'), JSON.stringify(['test@s.whatsapp.net']));
});

test('corrupt persisted alert state must not initialize a false replacement state', () => {
  fs.writeFileSync(file('state.json'), '{partial');
  assert.throws(() => store.getState(), /state|invalid|corrupt|parse/i);
  fs.writeFileSync(file('state.json'), 'null');
  assert.throws(() => store.getState(), /state|invalid|corrupt/i);
  fs.writeFileSync(file('state.json'), JSON.stringify(validState));
  assert.deepEqual(store.getState(), validState);
});

test('a failed temporary write preserves the last complete state file', () => {
  store.saveState(validState);
  const oldWrite = fs.writeFileSync;
  let attempted = false;
  try {
    fs.writeFileSync = function (...args) {
      if (typeof args[0] === 'number') {
        attempted = true;
        const error = new Error('synthetic ENOSPC write failure with private bytes');
        error.code = 'ENOSPC';
        throw error;
      }
      return oldWrite.apply(this, args);
    };
    assert.throws(() => store.saveState({ ...validState, level: 'SAFE' }),
      /FloodGuard local write failed/);
  } finally {
    fs.writeFileSync = oldWrite;
  }
  assert.equal(attempted, true, 'fault injected on the actual staging descriptor');
  assert.deepEqual(store.getState(), validState);
});
