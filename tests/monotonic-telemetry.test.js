'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-monotonic-'));
process.env.DATA_PATH = dir;
const { subscribe, saveState, getState } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
const jid = 'synthetic-ordered@s.whatsapp.net';
subscribe(jid);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const snapshot = (distanceCm, ts) => ({
  water: { distanceCm, status: 'UNKNOWN' },
  gate: { angle: 0, status: 'CLOSED', countdownSeconds: 0 },
  alarm: { active: false },
  system: { lastUpdate: ts, overallRisk: 'LOW' }
});
const reset = () => saveState({ initialized: false, level: 'UNKNOWN',
  gateStatus: 'UNKNOWN', procedureId: null, sentCountdown: [] });

test('a late but still fresh SAFE observation cannot reverse a newer confirmed DANGER', async () => {
  reset();
  const texts = [];
  const sock = { sendMessage: async (_jid, body) => { texts.push(body.text); } };
  const now = Date.now();
  await processLiveChange(sock, snapshot(21, now - 2500));
  await processLiveChange(sock, snapshot(13, now - 1000));
  assert.equal(getState().level, 'DANGER');
  assert.equal(texts.filter(t => t.includes('FLOODGUARD DANGER')).length, 1);
  const savedSource = getState().lastSourceAt;
  await processLiveChange(sock, snapshot(21, now - 1700));
  assert.equal(getState().level, 'DANGER', 'older SAFE must not supersede DANGER');
  assert.equal(getState().lastSourceAt, savedSource, 'source clock never regresses');
  assert.equal(texts.filter(t => t.includes('FLOODGUARD RECOVERY')).length, 0);
  await processLiveChange(sock, snapshot(21, now - 200));
  assert.equal(getState().level, 'SAFE', 'newer verified SAFE is accepted');
  assert.equal(texts.filter(t => t.includes('FLOODGUARD RECOVERY')).length, 1);
});

test('a late WARNING cannot replace a newer DANGER after state is persisted', async () => {
  const now = Date.now();
  reset();
  const msgs = [];
  const sock = { sendMessage: async (_jid, body) => msgs.push(body.text) };
  await processLiveChange(sock, snapshot(21, now - 2500));
  await processLiveChange(sock, snapshot(13, now - 750));
  const before = getState();
  assert.equal(before.level, 'DANGER');
  await processLiveChange(sock, snapshot(16, now - 1500));
  assert.equal(getState().level, 'DANGER');
  assert.equal(getState().lastSourceAt, before.lastSourceAt);
  assert.equal(msgs.filter(x => x.includes('FLOODGUARD WARNING')).length, 0);
});

test('stale out-of-order snapshots do not flag a newer healthy field state as stale', async () => {
  reset();
  const now = Date.now();
  const sock = { sendMessage: async () => {} };
  await processLiveChange(sock, snapshot(21, now - 2000));
  assert.equal(getState().dataStale, false);
  await processLiveChange(sock, snapshot(13, now - 130000));
  assert.equal(getState().level, 'SAFE');
  assert.equal(getState().dataStale, false);
});
