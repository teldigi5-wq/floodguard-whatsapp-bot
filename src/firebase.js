const { EventEmitter } = require('events');

const BASE = (
  process.env.FIREBASE_DATABASE_URL ||
  'https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app'
).replace(/\/+$/, '');

const AUTH = process.env.FIREBASE_AUTH || '';

function url() {
  return `${BASE}/floodguard/live.json${AUTH ? `?auth=${encodeURIComponent(AUTH)}` : ''}`;
}

async function getLive() {
  const response = await fetch(url(), {
    headers: { 'Cache-Control': 'no-cache' }
  });

  if (!response.ok) throw new Error(`Firebase HTTP ${response.status}`);
  return await response.json();
}

// Firebase RTDB REST streaming (Server-Sent Events).
// We coalesce bursts of patch/put events into one coherent getLive() read.
function streamLive() {
  const emitter = new EventEmitter();
  let stopped = false;
  let retryDelay = 1000;
  let refreshTimer = null;

  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      try {
        const live = await getLive();
        emitter.emit('live', live);
      } catch (error) {
        emitter.emit('error', error);
      }
    }, 120);
  };

  async function connect() {
    while (!stopped) {
      try {
        console.log('Connecting to FloodGuard Firebase stream...');
        const response = await fetch(url(), {
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) throw new Error(`Firebase stream HTTP ${response.status}`);
        if (!response.body) throw new Error('Firebase stream returned no response body');

        retryDelay = 1000;
        emitter.emit('connected');

        // Emit an immediate coherent initial snapshot.
        try {
          emitter.emit('live', await getLive());
        } catch (e) {
          emitter.emit('error', e);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // Normalize CRLF so SSE blocks are detected reliably on all runtimes.
          buffer = buffer.replace(/\r\n/g, '\n');
          let eventEnd;

          while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
            const eventBlock = buffer.substring(0, eventEnd);
            buffer = buffer.substring(eventEnd + 2);

            let eventName = '';
            let eventData = '';
            for (const line of eventBlock.split(/\r?\n/)) {
              if (line.startsWith('event:')) eventName = line.substring(6).trim();
              if (line.startsWith('data:')) eventData += line.substring(5).trim();
            }

            if (eventName === 'put' || eventName === 'patch') refresh();
            if (eventName === 'keep-alive') emitter.emit('keepalive');
            if (eventName === 'cancel' || eventName === 'auth_revoked') {
              throw new Error(`Firebase ${eventName}: ${eventData}`);
            }
          }
        }
      } catch (error) {
        emitter.emit('error', error);
      }

      if (!stopped) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    }
  }

  connect();

  emitter.stop = () => {
    stopped = true;
    if (refreshTimer) clearTimeout(refreshTimer);
  };

  return emitter;
}

module.exports = { getLive, streamLive };
