'use strict';
// Offline-only: verify that every user-facing command reports suspended delivery.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-command-delivery-'));
process.env.DATA_PATH = dir;
const { saveState } = require('../src/store');
const { commandReply } = require('../src/floodguard');
const stateFile = path.join(dir, 'state.json');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const jid = 'synthetic-operator@s.whatsapp.net';
const commands = [
  'menu', 'hello', 'help', 'water', 'gate', 'rain', 'devices',
  'network', 'unsubscribe', 'unknown-command'
];
const live = () => ({
  water: { distanceCm: 13, status: 'DANGER' },
  gate: { status: 'CLOSED', angle: 0, countdownSeconds: 0 },
  devices: { rainGauge: 'OFFLINE' },
  esp8266: { status: 'CONNECTED' },
  alarm: { active: true },
  system: { lastUpdate: Date.now() - 1000, overallRisk: 'HIGH' }
});
const state = (extra = {}) => ({
  initialized: true, level: 'DANGER', gateStatus: 'CLOSED',
  procedureId: null, sentCountdown: [],
  deliveryUncertain: true, deliveryDegraded: true, ...extra
});

test('every previously unguarded reply warns when automatic delivery is quarantined', async () => {
  saveState(state());
  const before = fs.readFileSync(stateFile);
  for (const command of commands) {
    const reply = await commandReply(jid, command, live);
    assert.match(reply, /ALERT DELIVERY PAUSED/, command);
    assert.match(reply, /manual warning fallback/i, command);
    assert.doesNotMatch(reply, /automatic alerts ON/i, command);
  }
  assert.deepEqual(fs.readFileSync(stateFile), before, 'commands must not clear the alert quarantine');
});

test('degraded delivery is distinct from a paused send queue on all commands', async () => {
  saveState(state({ deliveryUncertain: false }));
  for (const command of commands) {
    const reply = await commandReply(jid, command, live);
    assert.match(reply, /DELIVERY DEGRADED/, command);
    assert.doesNotMatch(reply, /ALERT DELIVERY PAUSED/, command);
  }
});

test('normal stored state does not manufacture a delivery incident', async () => {
  saveState(state({ deliveryUncertain: false, deliveryDegraded: false }));
  for (const command of commands) {
    const reply = await commandReply(jid, command, live);
    assert.doesNotMatch(reply, /ALERT DELIVERY PAUSED|DELIVERY DEGRADED/, command);
  }
});

test('corrupt private state produces a safe unknown warning without leaking contents', async () => {
  fs.writeFileSync(stateFile, '{"secret":"synthetic-private-token"', { mode: 0o600 });
  const before = fs.readFileSync(stateFile);
  for (const command of ['menu', 'water', 'gate', 'devices', 'network', 'unknown-command']) {
    const reply = await commandReply(jid, command, live);
    assert.match(reply, /ALERT DELIVERY STATUS UNKNOWN/, command);
    assert.match(reply, /manual warning/i, command);
    assert.doesNotMatch(reply, /synthetic-private-token|private state.json/i, command);
  }
  assert.deepEqual(fs.readFileSync(stateFile), before, 'never silently reset corrupt state');
});

test('offline water command still includes the paused-delivery warning', async () => {
  saveState(state());
  const reply = await commandReply(jid, 'water', async () => null);
  assert.match(reply, /NOT AVAILABLE/);
  assert.match(reply, /ALERT DELIVERY PAUSED/);
});
