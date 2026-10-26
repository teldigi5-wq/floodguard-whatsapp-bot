'use strict';
// Subprocess-only regression. All fetches return synthetic HTTP 503.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('stopping failed Firebase child streams cancels all pending reconnect timers', () => {
  const moduleFile = path.resolve(__dirname, '../src/firebase.js');
  const program = String.raw`'use strict';
const {streamLive, CHANNELS} = require(process.argv[1]);
let requests=0;
globalThis.fetch = async (_url,opts) => {
  requests++;
  if (opts.redirect !== 'error') throw Error('unexpected redirect policy');
  return new Response('SYNTHETIC UNAVAILABLE', {status:503});
};
const stream = streamLive();
stream.on('error', () => {});
setTimeout(() => {
  if (requests !== CHANNELS.length) throw Error('mock requests never started');
  stream.stop();
}, 75);
`;
  // Previous implementation left nine live 1000-ms timers after stop(),
  // keeping the process alive. The child must exit without process.exit()
  // before that delay elapses. No Firebase credentials or URL is accessed.
  const result = spawnSync(process.execPath, ['-e', program, moduleFile], {
    encoding: 'utf8',
    timeout: 800,
    maxBuffer: 64 * 1024
  });
  assert.equal(result.error, undefined,
    'synthetic process retained reconnect timers after stop()');
  assert.equal(result.status, 0,
    'stopping an offline watcher must exit normally without force termination');
  assert.equal(result.stderr, '');
});
