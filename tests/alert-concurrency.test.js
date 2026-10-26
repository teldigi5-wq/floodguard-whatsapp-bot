'use strict';

// Offline virtual WhatsApp tests. No network, Firebase, QR or physical hardware.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'floodguard-serial-alerts-'));
process.env.DATA_PATH = directory;
const { subscribe, saveState, getState } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
const jid = 'synthetic-serialized-alerts@s.whatsapp.net';
subscribe(jid);
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function snapshot(distanceCm, timestamp = Date.now()) {
  return {
    water: { distanceCm, status: 'UNKNOWN' },
    gate: { status: 'CLOSED', angle: 0, countdownSeconds: 0 },
    alarm: { active: false },
    system: { lastUpdate: timestamp, overallRisk: 'LOW' }
  };
}

function reset() {
  saveState({
    initialized: false, level: 'UNKNOWN', gateStatus: 'UNKNOWN',
    procedureId: null, sentCountdown: [], lastEventKey: ''
  });
}

function slowSocket() {
  const messages = [];
  return {
    messages,
    sock: {
      sendMessage: async (to, body) => {
        assert.equal(to, jid);
        messages.push(body.text);
        // Give a second event an opportunity to race with the first.
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
  };
}

test('simultaneous identical DANGER readings must not duplicate WhatsApp alerts', async () => {
  reset();
  const { sock, messages } = slowSocket();
  await processLiveChange(sock, snapshot(21, Date.now() - 2000));
  const danger = snapshot(13, Date.now() - 1000);
  await Promise.all([
    processLiveChange(sock, danger),
    processLiveChange(sock, structuredClone(danger))
  ]);
  const dangerAlerts = messages.filter(message => message.includes('FLOODGUARD DANGER'));
  assert.equal(dangerAlerts.length, 1, 'concurrent callbacks must share persisted transition state');
  assert.equal(getState().level, 'DANGER');
});

test('overlapping WARNING and DANGER transitions preserve arrival order', async () => {
  reset();
  const { sock, messages } = slowSocket();
  const now = Date.now();
  await processLiveChange(sock, snapshot(21, now - 2000));
  await Promise.all([
    processLiveChange(sock, snapshot(16, now - 1200)),
    processLiveChange(sock, snapshot(13, now - 700))
  ]);
  const alerts = messages.filter(text => /FLOODGUARD (WARNING|DANGER)/.test(text));
  assert.equal(alerts.length, 2);
  assert.match(alerts[0], /FLOODGUARD WARNING/);
  assert.match(alerts[1], /FLOODGUARD DANGER/);
  assert.equal(getState().level, 'DANGER');
});

test('an invalid telemetry callback does not permanently poison later processing', async () => {
  reset();
  const { sock } = slowSocket();
  const broken = {
    water: {
      get distanceCm() {
        throw new Error('synthetic malformed telemetry property');
      }
    }
  };
  await assert.rejects(processLiveChange(sock, broken), /synthetic malformed telemetry/);
  await processLiveChange(sock, snapshot(21));
  assert.equal(getState().initialized, true);
  assert.equal(getState().level, 'SAFE');
});
