'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLive, streamLive, CHANNELS, mergeEvent } = require('../src/firebase');

const original = globalThis.fetch;
test.after(() => { globalThis.fetch = original; });
const paths = CHANNELS.map(([, p]) => p);

test('public telemetry reads only exact Firebase child nodes', async () => {
  const seen = [];
  globalThis.fetch = async url => {
    const u = new URL(url);
    seen.push(u.pathname);
    const child = paths.find(x => u.pathname.endsWith('/floodguard/live/' + x + '.json'));
    assert.ok(child, 'Only exact allowlisted child URLs may be fetched');
    return new Response(JSON.stringify(child === 'water' ? { distanceCm: 12.5 } : null), { status: 200 });
  };
  const live = await getLive();
  assert.equal(live.water.distanceCm, 12.5);
  assert.equal(live.rain, null);
  assert.equal(live.esp8266.connection, null);
  assert.equal(seen.length, paths.length);
  assert.ok(!seen.some(x => x.endsWith('/floodguard/live.json')));
  assert.ok(!seen.some(x => /\/esp8266\/(?:ip|wifi)\.json$/.test(x)));
});

test('denied public child reads fail closed without a fabricated live snapshot', async () => {
  globalThis.fetch = async () => new Response('Permission denied', { status: 401 });
  await assert.rejects(getLive(), /HTTP 401/);
});

test('Firebase patches merge nested fields while refusing prototype paths', () => {
  const prior = { gate: { status: 'CLOSED', countdownSeconds: 0 } };
  const changed = mergeEvent(prior, '/gate', { status: 'OPEN' }, 'patch');
  assert.equal(changed.gate.status, 'OPEN');
  assert.equal(changed.gate.countdownSeconds, 0);
  assert.equal(prior.gate.status, 'CLOSED');
  assert.equal(mergeEvent(null, '/', { status: 'SAFE' }, 'put').status, 'SAFE');
  assert.throws(() => mergeEvent({}, '/__proto__/isAdmin', true, 'put'), /rejected/);
});

test('all child SSE streams compose into one redacted coherent snapshot', async () => {
  const opened = [];
  const enc = new TextEncoder();
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    const child = paths.find(x => u.pathname.endsWith('/floodguard/live/' + x + '.json'));
    assert.ok(child);
    opened.push(child);
    const sample = child === 'water' ? { distanceCm: 14, status: 'SAFE' } :
      child === 'system' ? { lastUpdate: Date.now() } :
      child === 'esp8266/connection' ? 'ONLINE' : null;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode('event: put\n' +
          'data: ' + JSON.stringify({ path: '/', data: sample }) + '\n\n'));
        options.signal.addEventListener('abort', () => {
          try { controller.close(); } catch {}
        }, { once: true });
      }
    });
    return new Response(stream, { status: 200 });
  };
  const liveStream = streamLive();
  try {
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        liveStream.once('live', resolve);
        liveStream.once('error', reject);
      }),
      new Promise((_resolve, reject) => setTimeout(() => reject(Error('SSE startup timed out')), 3000))
    ]);
    assert.equal(result.water.distanceCm, 14);
    assert.equal(result.esp8266.connection, 'ONLINE');
    assert.ok(!Object.hasOwn(result.esp8266, 'ip'));
    assert.ok(!Object.hasOwn(result.esp8266, 'wifi'));
    assert.equal(opened.length, paths.length);
  } finally {
    liveStream.stop();
  }
});
