'use strict';
// All recipients and transport errors in this file are deliberately fake.
// This test must never contact WhatsApp, Firebase or hardware.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-delivery-diagnostic-'));
process.env.DATA_PATH = dir;
const { subscribe, saveState, getState } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
const goodJid = 'example-success@s.whatsapp.net';
const badJid = 'example-failure@s.whatsapp.net';
subscribe(goodJid);
subscribe(badJid);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const reading = (distanceCm, ts) => ({
  water: { distanceCm, status: 'UNKNOWN' },
  gate: { status: 'CLOSED', angle: 0, countdownSeconds: 0 },
  alarm: { active: false },
  system: { lastUpdate: ts, overallRisk: 'LOW' }
});

test('a partial synthetic send failure is counted without exposing recipient or token', async () => {
  saveState({
    initialized: false, level: 'UNKNOWN', gateStatus: 'UNKNOWN',
    procedureId: null, sentCountdown: []
  });
  const sent = [];
  const secret = 'synthetic-private-transport-token-should-not-appear';
  const sock = {
    sendMessage: async (jid, message) => {
      if (jid === badJid) throw Error('https://example.invalid/?auth=' + secret);
      sent.push({ jid, text: message.text });
    }
  };
  const logs = [];
  const oldError = console.error;
  const now = Date.now();
  try {
    console.error = (...args) => logs.push(args.map(String).join(' '));
    await processLiveChange(sock, reading(21, now - 2000));
    await processLiveChange(sock, reading(13, now - 1000));
  } finally {
    console.error = oldError;
  }
  assert.equal(sent.filter(v => v.text.includes('FLOODGUARD DANGER')).length, 1);
  assert.equal(getState().level, 'DANGER');
  assert.equal(getState().alertSendFailureCount, 1, 'partial failures must be recorded explicitly');
  assert.equal(getState().deliveryDegraded, true, 'operator must not infer that all recipients were alerted');
  const output = logs.join('\n');
  assert.match(output, /delivery failed/i);
  assert.ok(!output.includes(secret), 'transport secret must not leak to logs');
  assert.ok(!output.includes(badJid), 'recipient identity must not leak to logs');
  assert.ok(!output.includes('example.invalid'), 'private transport URL must not leak to logs');
});

test('recorded delivery degradation survives subsequent healthy transitions', async () => {
  const now = Date.now();
  const sock = { sendMessage: async () => {} };
  await processLiveChange(sock, reading(21, now - 100));
  const state = getState();
  assert.equal(state.alertSendFailureCount, 1);
  assert.equal(state.deliveryDegraded, true, 'a later success cannot rewrite history as fully delivered');
});
