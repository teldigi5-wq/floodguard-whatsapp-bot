'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { streamLive, CHANNELS, mergeEvent } = require('../src/firebase');

test('Firebase SSE frames split between CR and LF still form a coherent snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  const encoder = new TextEncoder();
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    const child = CHANNELS.find(([, path]) =>
      pathname.endsWith('/floodguard/live/' + path + '.json'));
    assert.ok(child, 'never stream from private Firebase parent nodes');
    assert.equal(options.redirect, 'error');
    const key = child[0];
    seen.push(key);
    const value = key === 'water'
      ? { distanceCm: 14, status: 'WARNING' }
      : key === 'system'
        ? { lastUpdate: Date.now() }
        : null;
    const payload = JSON.stringify({ path: '/', data: value });
    // Network chunk boundaries may split a CRLF *between* bytes.
    // Every event line and the terminating blank line are fragmented.
    const chunks = [
      'event: put\r',
      '\ndata: ' + payload + '\r',
      '\n\r',
      '\n'
    ];
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        options.signal.addEventListener('abort', () => {
          try { controller.close(); } catch {}
        }, { once: true });
      }
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    });
  };

  const stream = streamLive();
  let timeout;
  try {
    const snapshot = await Promise.race([
      new Promise((resolve, reject) => {
        stream.once('live', resolve);
        stream.once('error', reject);
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('CRLF-fragmented SSE timed out')), 1800);
      })
    ]);
    assert.equal(snapshot.water.distanceCm, 14);
    assert.equal(snapshot.system.lastUpdate > 0, true);
    assert.equal(snapshot.esp8266.ip, undefined);
    assert.equal(snapshot.esp8266.wifi, undefined);
    assert.deepEqual(new Set(seen), new Set(CHANNELS.map(([key]) => key)));
  } finally {
    clearTimeout(timeout);
    stream.stop();
    globalThis.fetch = originalFetch;
  }
});

test('Firebase patch paths reject prototype manipulation without touching prototypes', () => {
  for (const unsafe of ['/__proto__/polluted', '/constructor/prototype/admin', '/prototype']) {
    assert.throws(() => mergeEvent({}, unsafe, true, 'put'), /rejected/);
  }
  assert.equal({}.polluted, undefined);
  const initial = { water: { distanceCm: 20, status: 'SAFE' } };
  const next = mergeEvent(initial, '/water', { distanceCm: 13 }, 'patch');
  assert.equal(initial.water.distanceCm, 20, 'caller state is immutable');
  assert.equal(next.water.distanceCm, 13);
  assert.equal(next.water.status, 'SAFE');
});

test('Firebase REST never follows redirects and does not accept denied child reads', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.match(new URL(url).pathname, /\/floodguard\/live\/.+\.json$/);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('Denied', { status: 403 });
  };
  try {
    const { getLive } = require('../src/firebase');
    await assert.rejects(getLive(), /Firebase public telemetry HTTP 403/);
    assert.equal(requests, CHANNELS.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
