'use strict';
// All scenarios use synthetic telemetry, a fake WhatsApp socket, and
// isolated temporary state. No Firebase or WhatsApp API is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floodguard-virtual-test-'));
process.env.DATA_PATH = dir;
const { subscribe, getState } = require('../src/store');
const { commandReply, processLiveChange, level, isStale, normalizeGate } = require('../src/floodguard');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function synthetic(distanceCm, timestamp = Date.now()) {
  return {
    water: { distanceCm, status: 'UNKNOWN' },
    gate: { angle: 0, status: 'CLOSED', countdownSeconds: 0 },
    alarm: { active: false },
    system: { lastUpdate: timestamp, overallRisk: 'LOW' }
  };
}

test('missing, null, blank and invalid sensor measurements never become zero or SAFE', async () => {
  const missing = [
    { distanceCm: null, levelCm: null },
    { distanceCm: '', levelCm: '' },
    { distanceCm: '   ', levelCm: null },
    { distanceCm: 'bad', levelCm: undefined },
    { distanceCm: false, levelCm: false },
    { distanceCm: {}, levelCm: [] }
  ];
  for (const water of missing) {
    const snapshot = { water: { ...water, status: 'SENSOR_ERROR' }, system: { lastUpdate: Date.now() } };
    assert.equal(level(snapshot), 'SENSOR_ERROR', JSON.stringify(water));
    const reply = await commandReply('synthetic-test-contact', 'water', async () => snapshot);
    assert.match(reply, /Actual Level: NOT AVAILABLE/, JSON.stringify(water));
    assert.match(reply, /Status: \*SENSOR_ERROR\*/);
  }
  assert.equal(level({ water: { levelCm: 0, status: 'UNKNOWN' } }), 'SAFE',
    'genuine sensor level zero is still a valid safe reading');
  assert.equal(level({ water: { distanceCm: null, levelCm: null, status: 'SAFE' } }),
    'UNKNOWN', 'backend SAFE without a sensor value must not imply verified safety');
  assert.equal(level(synthetic(16.5)), 'WARNING');
  assert.equal(level(synthetic(14)), 'DANGER');
});

test('virtual WhatsApp receives state transitions, not duplicate or stale flood alerts', async () => {
  const sent = [];
  const jid = 'test-only@s.whatsapp.net';
  const sock = { sendMessage: async (recipient, content) => sent.push({ recipient, text: content.text }) };
  subscribe(jid);
  const now = Date.now();

  await processLiveChange(sock, synthetic(21, now - 4000));
  assert.equal(sent.length, 0, 'first good snapshot seeds state without an invented alert');
  assert.equal(getState().level, 'SAFE');

  const warning = synthetic(16, now - 3000);
  await processLiveChange(sock, warning);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /FLOODGUARD WARNING/);
  assert.equal(sent[0].recipient, jid);
  await processLiveChange(sock, warning);
  assert.equal(sent.length, 1, 'repeating the same snapshot must be idempotent');

  const danger = synthetic(13, now - 2000);
  await processLiveChange(sock, danger);
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /FLOODGUARD DANGER/);
  assert.equal(getState().level, 'DANGER');

  const unverifiedSafe = synthetic(null, now - 1500);
  unverifiedSafe.water.levelCm = null;
  unverifiedSafe.water.status = 'SAFE';
  await processLiveChange(sock, unverifiedSafe);
  assert.equal(sent.length, 2, 'missing measurements cannot generate a false SAFE recovery');
  assert.equal(getState().level, 'DANGER', 'preserve last confirmed danger until new measured data');

  const old = synthetic(21, now - 120000);
  assert.equal(isStale(old), true);
  await processLiveChange(sock, old);
  assert.equal(sent.length, 2, 'stale data must never announce recovery');
  assert.equal(getState().dataStale, true);

  await processLiveChange(sock, synthetic(21, now - 1000));
  assert.equal(sent.length, 3);
  assert.match(sent[2].text, /FLOODGUARD RECOVERY/);
  assert.equal(getState().dataStale, false);
});


test('sensor out-of-range or explicitly null distance cannot fake safety', async () => {
  for (const input of [0, -1, 400.01, 401, 1000, 'Infinity', 'bad', null, '']) {
    const snapshot = synthetic(input);
    snapshot.water.levelCm = 0; // potentially stale Firebase child
    snapshot.water.status = 'SAFE';
    assert.equal(level(snapshot), 'UNKNOWN', 'out-of-range or missing distance: ' + input);
    const reply = await commandReply('synthetic-test-contact', 'water', async () => snapshot);
    assert.match(reply, /Actual Level: NOT AVAILABLE/, String(input));
    assert.match(reply, /Status: \*UNKNOWN\*/, String(input));
  }
  const errored = { water: { levelCm: 0, status: 'SENSOR_ERROR' } };
  assert.equal(level(errored), 'SENSOR_ERROR',
    'an explicit error status defeats potentially stale derived level');
  assert.equal(level({ water: { levelCm: 0, status: 'UNKNOWN' } }), 'SAFE',
    'direct-only valid level provider remains supported');
  assert.equal(level(synthetic(400)), 'SAFE', 'HC-SR04 upper valid range remains accepted');
});

test('unknown servo telemetry must not turn an OPEN gate into CLOSED', () => {
  assert.equal(normalizeGate({ gate: { status: 'OPEN', angle: null, countdownSeconds: null } }), 'OPEN');
  assert.equal(normalizeGate({ gate: { status: 'OPEN', angle: '', countdownSeconds: '' } }), 'OPEN');
  assert.equal(normalizeGate({ gate: { status: 'OPEN', angle: 'bad', countdownSeconds: null } }), 'OPEN');
  assert.equal(normalizeGate({ gate: { angle: null, countdownSeconds: null } }), 'UNKNOWN');
  assert.equal(normalizeGate({ gate: { status: 'CLOSED', angle: 0, countdownSeconds: null } }), 'CLOSED');
  assert.equal(normalizeGate({ gate: { status: 'OPENING_WARNING', angle: null, countdownSeconds: 5 } }), 'COUNTDOWN');
});

test('future or invalid telemetry timestamps cannot bypass freshness gate', async () => {
  const now = Date.now();
  const tooFuture = synthetic(14, now + 60_000);
  assert.equal(isStale(tooFuture), true);
  assert.equal(isStale(synthetic(14, now + 3000)), false,
    'limited clock skew may be tolerated');
  assert.equal(isStale(synthetic(14, now - 120_000)), true);
  assert.equal(isStale({ system: { lastUpdate: null } }), true);
  assert.equal(isStale({ system: { lastUpdate: 'garbage' } }), true);
  const sent = [];
  await processLiveChange({sendMessage: async (_to, msg) => sent.push(msg)}, tooFuture);
  assert.equal(sent.length, 0, 'future-dated danger must not broadcast an unverified alert');
});


test('WhatsApp replies redact private Firebase transport failure details', async () => {
  const internal = 'https://example.invalid/private.json?auth=synthetic-secret-98765';
  const reply = await commandReply('synthetic-test-contact', 'stats', async () => {
    throw new Error(internal);
  });
  assert.match(reply, /FIREBASE NOT AVAILABLE/);
  assert.match(reply, /No sensor value has been fabricated/);
  assert.ok(!reply.includes('synthetic-secret'));
  assert.ok(!reply.includes('example.invalid'));
});
