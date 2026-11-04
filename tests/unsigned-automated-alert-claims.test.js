'use strict';
// H13 offline-only safety claims: no live Firebase, WhatsApp, cloud,
// authentic identifiers, signed certificates, firmware, or physical gate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-h13-unsigned-alerts-'));
process.env.DATA_PATH = dir;
const { subscribe, saveState, getState } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
const jid = 'h13-offline-synthetic@s.whatsapp.net';
subscribe(jid);
test.after(() => fs.rmSync(dir, { recursive:true, force:true }));

function fixture(distanceCm, sourceAt, opts={}) {
  return {
    water: { distanceCm, status: opts.waterStatus || 'UNKNOWN' },
    rain: { currentMm:0, dailyMm:0, status:'NORMAL' },
    system: { lastUpdate:sourceAt, overallRisk:'LOW' },
    gate: { status:opts.gateStatus || 'CLOSED',
      angle:opts.gateAngle ?? 0, countdownSeconds:0 },
    alarm: { active:false },
    devices: { arduino:'ONLINE', ultrasonic:'ONLINE' }
  };
}
function setup() {
  saveState({ initialized:false, level:'UNKNOWN', gateStatus:'UNKNOWN',
    procedureId:null, sentCountdown:[], lastEventKey:'', lastSourceAt:0,
    deliveryUncertain:false, deliveryDegraded:false, sensorFaultActive:false });
  const sent = [];
  const socket = { sendMessage: async (to, payload) => {
    assert.equal(to, jid);
    assert.equal(typeof payload.text,'string');
    sent.push(payload.text);
  }};
  return {sent,socket};
}
function expectedProvenance(text) {
  assert.match(text,/SOURCE UNVERIFIED/);
  assert.match(text,/unsigned Firebase telemetry/);
  assert.match(text,/not independently verified/);
  assert.match(text,/independent\/manual safety procedure/);
  assert.doesNotMatch(text,/SOURCE VERIFIED|PHYSICALLY CERTIFIED/);
}

test('automated WARNING, DANGER and reported SAFE retain unsigned-source notice', async () => {
  const {sent,socket} = setup();
  const now = Date.now();
  await processLiveChange(socket, fixture(21,now-5000)); // initial SAFE baseline
  assert.equal(sent.length,0);
  await processLiveChange(socket, fixture(16,now-4000)); // warning
  await processLiveChange(socket, fixture(13,now-3000)); // danger
  await processLiveChange(socket, fixture(21,now-2000)); // unverified recovery report
  assert.equal(sent.length,3);
  for(const message of sent) expectedProvenance(message);
  assert.match(sent[0],/FLOODGUARD WARNING/);
  assert.match(sent[0],/possible warning-zone water level/);
  assert.match(sent[1],/FLOODGUARD DANGER/);
  assert.match(sent[1],/possible critical water level/);
  assert.match(sent[2],/FLOODGUARD RECOVERY REPORT — NOT AN ALL-CLEAR/);
  assert.match(sent[2],/NOT a verified all-clear/);
  assert.match(sent[2],/Keep independent warnings and manual checks active/);
  assert.doesNotMatch(sent[2],/Water conditions have returned to SAFE/);
  // Stored scalar observation is not evidence of field safety.
  assert.equal(getState().level,'SAFE');
});

test('an unsigned reported OPEN gate cannot produce an unqualified gate-opening notice', async () => {
  const {sent,socket} = setup();
  const now=Date.now();
  await processLiveChange(socket, fixture(21,now-4000));
  await processLiveChange(socket, fixture(21,now-3000,{gateStatus:'OPEN',gateAngle:90}));
  assert.equal(sent.length,1);
  assert.match(sent[0],/FLOODGUARD DAM GATE OPEN/);
  assert.match(sent[0],/Physical position is not independently verified/);
  expectedProvenance(sent[0]);
});

test('sensor failure retains a qualified warning rather than advertising a safe reading', async () => {
  const {sent,socket} = setup();
  const now=Date.now();
  await processLiveChange(socket, fixture(21,now-4000));
  await processLiveChange(socket,fixture(null,now-3000,{waterStatus:'SENSOR_ERROR'}));
  assert.equal(sent.length,1);
  assert.match(sent[0],/FLOODGUARD SENSOR ALERT/);
  assert.match(sent[0],/Do not treat the reservoir as safe/);
  expectedProvenance(sent[0]);
});

test('a stale unsigned SAFE cannot send a recovery or erase a pending DANGER', async () => {
  const {sent,socket} = setup();
  const now=Date.now();
  await processLiveChange(socket,fixture(21,now-5000));
  await processLiveChange(socket,fixture(13,now-4000));
  const count=sent.length;
  await processLiveChange(socket,fixture(21,now-120000));
  assert.equal(sent.length,count);
  assert.equal(getState().level,'DANGER');
  assert.doesNotMatch(sent.join('\n'),/RECOVERY REPORT/);
});
