'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const origin = 'http://127.0.0.1:9000';
const namespace = 'demo-floodguard-default-rtdb';
const adminSuffix = '?ns=' + namespace + '&auth=owner';

// Fail closed: no production URL or fallback is ever permitted in this test.
process.env.FIREBASE_DATABASE_URL = origin;
delete process.env.FIREBASE_AUTH;
const { PUBLIC_PATHS, getLive, streamLive } = require('../src/firebase');

const nativeFetch = global.fetch;
const calls = [];

global.fetch = (input, options = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, origin, 'Emulator contract tests must never contact production');
  assert.ok(PUBLIC_PATHS.some(path => url.pathname === '/floodguard/live/' + path + '.json'),
    'Bot must never read the parent /live or private ESP fields');
  assert.equal((options.method || 'GET').toUpperCase(), 'GET', 'Bot is read-only');
  url.searchParams.set('ns', namespace);
  calls.push(url.pathname);
  return nativeFetch(url, options);
};

const mockData = {
  water: { distanceCm: 15.35, levelCm: 9.65, status: 'WARNING' },
  rain: { currentMm: 0, dailyMm: 0, status: 'NORMAL' },
  gate: { status: 'CLOSED', angle: 0, countdownSeconds: 0 },
  alarm: { active: false, type: 'NONE' },
  devices: { arduino: 'ONLINE', esp8266: 'ONLINE' },
  system: { lastUpdate: 1720000000000, overallRisk: 'MODERATE' },
  esp8266: {
    status: 'ONLINE', connection: 'CONNECTED', rssi: -61,
    ip: '192.0.2.8', wifi: 'TEST-ONLY'
  }
};

async function fixtureWrite(path, value) {
  const url = origin + path + '.json' + adminSuffix;
  const response = await nativeFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  assert.equal(response.status, 200, 'Emulator fixture write rejected: ' + path);
  await response.body?.cancel();
}

function withTimeout(ms, callback) {
  let timer;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for Firebase emulator stream')), ms);
    callback(resolve, reject);
  }).finally(() => clearTimeout(timer));
}

test('recovered EC2 bot reads child-only telemetry under the Phase A RTDB rules', async () => {
  await fixtureWrite('/floodguard/live', mockData);
  const previous = calls.length;
  const snapshot = await getLive();
  assert.equal(snapshot.water.levelCm, 9.65);
  assert.equal(snapshot.gate.status, 'CLOSED');
  assert.equal(snapshot.esp8266.status, 'ONLINE');
  assert.equal(snapshot.esp8266.connection, 'CONNECTED');
  assert.ok(!Object.hasOwn(snapshot.esp8266, 'ip'));
  assert.ok(!Object.hasOwn(snapshot.esp8266, 'wifi'));
  const requests = calls.slice(previous);
  assert.equal(requests.length, PUBLIC_PATHS.length);
  for (const path of requests) {
    assert.notEqual(path, '/floodguard/live.json');
    assert.notEqual(path, '/floodguard/live/esp8266.json');
    assert.ok(!path.includes('/wifi.json') && !path.includes('/ip.json'));
  }

  // Direct anonymous GETs are denied by the candidate; we intentionally
  // inspect HTTP statuses only, never the response body.
  for (const path of [
    '/floodguard/live',
    '/floodguard/live/esp8266',
    '/floodguard/live/esp8266/ip',
    '/floodguard/live/esp8266/wifi'
  ]) {
    const response = await nativeFetch(origin + path + '.json?ns=' + namespace);
    assert.ok(response.status === 401 || response.status === 403,
      'Firebase emulator exposed a restricted path: ' + path);
    await response.body?.cancel();
  }
});

test('recovered EC2 bot receives real Firebase Emulator SSE snapshots and updates', async () => {
  const monitor = streamLive();
  const errors = [];
  monitor.on('error', error => errors.push(error.message));
  try {
    const initial = await withTimeout(20000, (resolve) => monitor.once('live', resolve));
    assert.equal(initial.water.levelCm, 9.65);
    assert.equal(initial.gate.status, 'CLOSED');
    assert.equal(initial.esp8266.status, 'ONLINE');
    assert.ok(!Object.hasOwn(initial.esp8266, 'ip'));
    assert.ok(!Object.hasOwn(initial.esp8266, 'wifi'));

    const next = withTimeout(15000, resolve => monitor.once('live', value => {
      if (value.water?.levelCm === 10.25) resolve(value);
    }));
    await fixtureWrite('/floodguard/live/water/levelCm', 10.25);
    const updated = await next;
    assert.equal(updated.water.levelCm, 10.25);
    assert.equal(updated.gate.status, 'CLOSED');
    assert.deepEqual(errors, [], 'Firebase stream emitted errors: ' + errors.join(', '));
  } finally {
    monitor.stop();
  }
});
