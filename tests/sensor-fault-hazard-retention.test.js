'use strict';
// Offline, isolated synthetic transitions: no Firebase, real WhatsApp,
// cloud accounts, hardware control, or production subscriber records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-hazard-retention-'));
process.env.DATA_PATH = dir;
const { saveState, getState, subscribe } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const JID = 'synthetic-hazard@s.whatsapp.net';
function init(level, time) {
  saveState({
    initialized: true, level, gateStatus: 'UNKNOWN', procedureId: null,
    sentCountdown: [], lastEventKey: '', lastSourceAt: time - 4000,
    deliveryUncertain: false, deliveryDegraded: false,
    sensorFaultActive: false
  });
}
const reading = (distanceCm, status, time) => ({
  water: { distanceCm, status, levelCm: 0 },
  gate: { status: 'UNKNOWN', angle: null, countdownSeconds: null },
  system: { lastUpdate: time, overallRisk: 'HIGH' }
});
const recorder = () => {
  const messages = [];
  return { messages, sock: { sendMessage: async (_jid, msg) => messages.push(msg.text) } };
};

test('sensor error retains a prior DANGER and emits one fault notice, not recovery', async () => {
  const now = Date.now();
  init('DANGER', now);
  subscribe(JID);
  const { messages, sock } = recorder();

  await processLiveChange(sock, reading(25, 'SENSOR_ERROR', now - 3000));
  assert.equal(getState().level, 'DANGER');
  assert.equal(getState().sensorFaultActive, true);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /FLOODGUARD SENSOR ALERT/);
  assert.match(messages[0], /WARNING or DANGER is NOT cleared/);
  assert.doesNotMatch(messages[0], /FLOODGUARD RECOVERY/);

  await processLiveChange(sock, reading(25, 'SENSOR_ERROR', now - 2500));
  assert.equal(messages.length, 1, 'repeat fault must not notify repeatedly');
  assert.equal(getState().level, 'DANGER');

  await processLiveChange(sock, reading(25, 'SAFE', now - 1000));
  assert.equal(getState().level, 'SAFE');
  assert.equal(getState().sensorFaultActive, false);
  assert.equal(messages.length, 2);
  assert.match(messages[1], /FLOODGUARD RECOVERY/);
});

test('OFFLINE during WARNING preserves hazard; invalid echo cannot clear it', async () => {
  const now = Date.now();
  init('WARNING', now);
  const { messages, sock } = recorder();

  await processLiveChange(sock, reading(25, 'OFFLINE', now - 3000));
  assert.equal(getState().level, 'WARNING');
  assert.equal(getState().sensorFaultActive, true);
  assert.equal(messages.length, 1);

  await processLiveChange(sock, reading(400, 'SAFE', now - 2000));
  assert.equal(getState().level, 'WARNING');
  assert.equal(getState().sensorFaultActive, true,
    'unverified telemetry cannot clear a reported sensor failure');
  assert.equal(messages.length, 1);

  await processLiveChange(sock, reading(25, 'OFFLINE', now - 1500));
  assert.equal(getState().level, 'WARNING');
  assert.equal(messages.length, 1,
    'repeat fault after unknown reading must not notify repeatedly');

  await processLiveChange(sock, reading(25, 'SAFE', now - 1000));
  assert.equal(getState().level, 'SAFE');
  assert.equal(messages.length, 2);
  assert.match(messages[1], /FLOODGUARD RECOVERY/);
});

test('a stale sensor fault cannot clear prior hazard or emit a new alert', async () => {
  const now = Date.now();
  init('DANGER', now);
  const { messages, sock } = recorder();
  await processLiveChange(sock, reading(25, 'SENSOR_ERROR', now - 120000));
  assert.equal(getState().level, 'DANGER');
  assert.equal(messages.length, 0);
  assert.equal(getState().sensorFaultActive, false);
});
