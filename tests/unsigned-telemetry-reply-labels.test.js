'use strict';
// Nonproduction, offline-only message contract. No Firebase, WhatsApp,
// recipient registration, gate actuation, or production deployment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floodguard-unsigned-replies-'));
process.env.DATA_PATH = dir;
const { commandReply } = require('../src/floodguard');
test.after(() => fs.rmSync(dir, { recursive:true, force:true }));

function observation(timestamp, distanceCm=14) {
  return {
    water: { distanceCm, status:'DANGER' },
    rain: { currentMm:0, dailyMm:0, status:'NORMAL' },
    system: { lastUpdate:timestamp, overallRisk:'CRITICAL' },
    gate: { status:'CLOSED', angle:0, countdownSeconds:0 },
    alarm: { active:true, type:'WATER' },
    devices: { arduino:'ONLINE', ultrasonic:'ONLINE', rainGauge:'ONLINE' },
    esp8266: { status:'ONLINE', connection:'CONNECTED', rssi:-62 },
  };
}

test('every recent read-only command labels unsigned field status as unverified', async () => {
  const recent = observation(Date.now()-1500);
  for (const cmd of ['stats','status','water','risk','gate','rain','devices','network','emergency']) {
    const reply = await commandReply('synthetic-read-only@s.whatsapp.net', cmd, async () => recent);
    assert.match(reply, /RECENT REPORT · SOURCE UNVERIFIED/, cmd);
    assert.doesNotMatch(reply, /Data: LIVE|FLOODGUARD LIVE STATS/, cmd);
    assert.doesNotMatch(reply, /CERTIFIED|SOURCE VERIFIED|PHYSICALLY VERIFIED/, cmd);
  }
  const stats = await commandReply('synthetic-read-only@s.whatsapp.net', 'stats', async () => recent);
  assert.match(stats, /FLOODGUARD REPORTED STATS/);
  assert.match(stats, /Flood Risk: \*CRITICAL\*/, 'hazard is preserved as an unverified report');
});

test('stale reports never become LIVE or a trusted all-clear', async () => {
  const old = observation(Date.now()-3600_000,25);
  old.water.status = 'SAFE';
  old.system.overallRisk = 'LOW';
  for (const cmd of ['stats','water','risk','gate','devices','rain','network','emergency']) {
    const reply = await commandReply('synthetic-read-only@s.whatsapp.net', cmd, async () => old);
    assert.match(reply, /STALE · SOURCE UNVERIFIED/, cmd);
    assert.doesNotMatch(reply, /Data: LIVE|RECENT REPORT|FLOODGUARD LIVE STATS/, cmd);
  }
  const stats = await commandReply('synthetic-read-only@s.whatsapp.net','stats',async()=>old);
  assert.match(stats,/LAST RECORDED STATS/);
  assert.match(stats,/Flood Risk: \*UNKNOWN\*/, 'stale LOW cannot certify physical safety');
});

test('menu describes reported telemetry, not certified live sensor status', async () => {
  const reply = await commandReply('synthetic-read-only@s.whatsapp.net','menu',async()=>{
    throw new Error('The help menu must not contact Firebase');
  });
  assert.match(reply,/reported sensor summary/);
  assert.doesNotMatch(reply,/complete live summary/);
});

test('failed Firebase read remains unavailable, without propagating credentials', async () => {
  const reply = await commandReply('synthetic-read-only@s.whatsapp.net','stats',
    async()=>{throw new Error('https://private.example?auth=SECRET_MUST_NOT_LEAK');});
  assert.match(reply,/FIREBASE NOT AVAILABLE/);
  assert.doesNotMatch(reply,/SECRET_MUST_NOT_LEAK|private\.example/);
});
