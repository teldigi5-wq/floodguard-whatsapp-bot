'use strict';
const { EventEmitter } = require('node:events');

const BASE = (process.env.FIREBASE_DATABASE_URL ||
  'https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const AUTH = process.env.FIREBASE_AUTH || '';

// The Firebase privacy rules grant reads to these exact child nodes, never
// /floodguard/live itself or the private esp8266/ip and esp8266/wifi nodes.
const CHANNELS = Object.freeze([
  ['water', 'water'],
  ['rain', 'rain'],
  ['gate', 'gate'],
  ['alarm', 'alarm'],
  ['devices', 'devices'],
  ['system', 'system'],
  ['esp8266Connection', 'esp8266/connection'],
  ['esp8266Rssi', 'esp8266/rssi'],
  ['esp8266Status', 'esp8266/status']
]);
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_SSE_BUFFER = 128 * 1024;

function childUrl(child) {
  return BASE + '/floodguard/live/' + child + '.json' +
    (AUTH ? '?auth=' + encodeURIComponent(AUTH) : '');
}

async function getChild(child) {
  const response = await fetch(childUrl(child), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!response.ok) throw new Error('Firebase public telemetry HTTP ' + response.status);
  const contentLength = Number(response.headers?.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SNAPSHOT_BYTES)
    throw new Error('Firebase telemetry response too large');
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('Firebase telemetry response missing body');
  const parts = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SNAPSHOT_BYTES) throw new Error('Firebase telemetry response too large');
      parts.push(Buffer.from(value));
    }
  } finally {
    try { await reader.cancel(); } catch (_) {}
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts, total).toString('utf8'));
}

function assemble(values) {
  const live = {
    water: values.water ?? null,
    rain: values.rain ?? null,
    gate: values.gate ?? null,
    alarm: values.alarm ?? null,
    devices: values.devices ?? null,
    system: values.system ?? null,
    esp8266: {
      connection: values.esp8266Connection ?? null,
      rssi: values.esp8266Rssi ?? null,
      status: values.esp8266Status ?? null
    }
  };
  return CHANNELS.some(([key]) => values[key] != null) ? live : null;
}

async function getLive() {
  // Never read a parent: restrictive RTDB child rules do not inherit upward.
  const pairs = await Promise.all(CHANNELS.map(async ([key, path]) => [key, await getChild(path)]));
  return assemble(Object.fromEntries(pairs));
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function mergeEvent(current, path, incoming, eventType) {
  const segments = String(path || '/').split('/').filter(Boolean);
  if (segments.length > 12 || segments.some(k =>
    k === '__proto__' || k === 'constructor' || k === 'prototype')) {
    throw new Error('Firebase telemetry path rejected');
  }
  if (!segments.length) {
    if (eventType === 'patch' && plain(current) && plain(incoming)) {
      return { ...current, ...incoming };
    }
    return incoming;
  }
  const root = plain(current) ? structuredClone(current) : {};
  let node = root;
  for (const segment of segments.slice(0, -1)) {
    if (!plain(node[segment])) node[segment] = {};
    node = node[segment];
  }
  const key = segments[segments.length - 1];
  if (eventType === 'patch' && plain(node[key]) && plain(incoming)) {
    node[key] = { ...node[key], ...incoming };
  } else if (incoming === null) {
    delete node[key];
  } else {
    node[key] = incoming;
  }
  return root;
}

function streamLive() {
  const emitter = new EventEmitter();
  let stopped = false;
  let connected = false;
  let flushTimer = null;
  const controllers = new Set();
  const values = Object.create(null);
  const received = new Set();

  function publish() {
    if (stopped || received.size < CHANNELS.length) return;
    if (!connected) {
      connected = true;
      emitter.emit('connected');
    }
    emitter.emit('live', assemble(values));
  }
  function queuePublish() {
    if (flushTimer || stopped) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      publish();
    }, 180);
  }

  async function watch(key, child) {
    let retry = 1000;
    while (!stopped) {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch(childUrl(child), {
          redirect: 'error',
          signal: controller.signal,
          headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' }
        });
        if (!response.ok || !response.body) throw new Error('Firebase telemetry stream HTTP ' + response.status);
        retry = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // Every new SSE HTTP connection needs its own complete baseline.
        // Never merge an initial PATCH with values from a prior connection.
        let hasFreshRootSnapshot = false;
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          // Normalize after appending so CRLF split across network reads is handled.
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          if (buffer.length > MAX_SSE_BUFFER) throw new Error('Firebase telemetry event buffer exceeded limit');
          let marker;
          while ((marker = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, marker);
            buffer = buffer.slice(marker + 2);
            let eventType = '';
            const dataLines = [];
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith('event:')) eventType = line.slice(6).trim();
              if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (eventType === 'cancel' || eventType === 'auth_revoked') {
              throw new Error('Firebase telemetry access revoked');
            }
            if (eventType !== 'put' && eventType !== 'patch') continue;
            const payload = JSON.parse(dataLines.join('\n'));
            if (!plain(payload) || !Object.hasOwn(payload, 'data')) throw new Error('Malformed Firebase telemetry event');
            if (!hasFreshRootSnapshot) {
              // Firebase RTDB SSE starts with a root PUT. Ignore premature
              // PATCHes until a fresh complete root snapshot establishes a
              // coherent child reading. Incomplete baseline is not LIVE.
              if (eventType !== 'put' || payload.path !== '/') continue;
              hasFreshRootSnapshot = true;
              values[key] = null;
            }
            values[key] = mergeEvent(values[key], payload.path, payload.data, eventType);
            received.add(key);
            queuePublish();
          }
        }
        // HTTP/SSE may terminate cleanly (reader.read() returns done=true)
        // even though a child telemetry stream has failed. Report the outage
        // so the bot does not keep showing Firebase CONNECTED indefinitely.
        // Deliberate stop() remains silent.
        if (!stopped) throw new Error('Firebase telemetry stream closed unexpectedly');
      } catch (error) {
        if (!stopped) emitter.emit('error', error);
      } finally {
        controllers.delete(controller);
        controller.abort();
        received.delete(key);
        // Do not retain values from a disconnected stream generation.
        delete values[key];
        connected = false;
      }
      if (!stopped) {
        await new Promise(resolve => setTimeout(resolve, retry));
        retry = Math.min(retry * 2, 30000);
      }
    }
  }

  // Start asynchronously to let callers attach event listeners first.
  queueMicrotask(() => {
    for (const [key, child] of CHANNELS) watch(key, child);
  });

  emitter.stop = () => {
    stopped = true;
    if (flushTimer) clearTimeout(flushTimer);
    for (const controller of controllers) controller.abort();
  };
  return emitter;
}

module.exports = { getLive, streamLive, CHANNELS, mergeEvent };
