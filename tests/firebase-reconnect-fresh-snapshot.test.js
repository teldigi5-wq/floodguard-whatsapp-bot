'use strict';
// Offline Firebase reconnection simulator: no external network or credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const { streamLive, CHANNELS } = require('../src/firebase');

const encoder = new TextEncoder();
const frame = (kind, path, data) => encoder.encode(
  'event: ' + kind + '\n' +
  'data: ' + JSON.stringify({ path, data }) + '\n\n'
);
async function until(condition, label, maxMs = 3200) {
  const end = Date.now() + maxMs;
  while (!condition() && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, 12));
  }
  assert.equal(Boolean(condition()), true, 'synthetic ' + label + ' timed out');
}

test('reconnected child must receive full initial root PUT before partial patches can restore LIVE', async () => {
  const oldFetch = globalThis.fetch;
  let waterConnections = 0;
  let endWaterFirst;
  let deliverWaterRootSecond;
  const opened = [];
  const snapshots = [];
  const faults = [];
  let connected = 0;
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    const matched = CHANNELS.find(([, path]) =>
      pathname.endsWith('/floodguard/live/' + path + '.json'));
    assert.ok(matched, 'no private Firebase parent/credential path');
    assert.equal(options.redirect, 'error');
    const [key] = matched;
    opened.push(key);
    const stream = new ReadableStream({
      start(controller) {
        const send = (eventType, path, data) => controller.enqueue(frame(eventType, path, data));
        if (key === 'water') {
          waterConnections++;
          if (waterConnections === 1) {
            send('put', '/', {distanceCm: 21, status: 'SAFE'});
            endWaterFirst = () => controller.close();
          } else if (waterConnections === 2) {
            // A reconnecting stream that supplies a patch before its fresh
            // initial PUT must not inherit old air-gap distanceCm=21.
            send('patch', '/status', 'SAFE');
            deliverWaterRootSecond = () => send('put', '/', {distanceCm:13,status:'DANGER'});
          } else {
            throw Error('unexpected extra synthetic water reconnect');
          }
        } else if (key === 'system') {
          send('put','/',{lastUpdate:Date.now()});
        } else {
          send('put','/',null);
        }
        options.signal.addEventListener('abort', () => {
          try {controller.close();} catch {}
        }, {once:true});
      }
    });
    return new Response(stream, {status:200,headers:{'Content-Type':'text/event-stream'}});
  };
  const emitter = streamLive();
  emitter.on('live', value => snapshots.push(value));
  emitter.on('connected', () => {connected++;});
  emitter.on('error', error => faults.push(error.message));
  try {
    await until(() => snapshots.length === 1, 'first complete snapshot');
    assert.equal(snapshots[0].water.distanceCm,21);
    assert.equal(connected,1);
    assert.equal(opened.length, CHANNELS.length);
    endWaterFirst();
    await until(() => faults.length >= 1, 'EOF reported');
    await until(() => waterConnections === 2, 'water stream reconnected');
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.equal(connected,1,'partial reconnect patch must not relabel the service CONNECTED');
    assert.equal(snapshots.length,1,'partial reconnect patch must not publish old water distance');
    deliverWaterRootSecond();
    await until(() => snapshots.length === 2, 'fresh full reconnect snapshot');
    assert.equal(connected,2);
    assert.equal(snapshots[1].water.distanceCm,13);
    assert.equal(snapshots[1].water.status,'DANGER');
    assert.equal(snapshots[1].esp8266.ip,undefined);
    assert.ok(faults.every(x => !x.includes('auth=')));
  } finally {
    emitter.stop();
    globalThis.fetch = oldFetch;
  }
});
