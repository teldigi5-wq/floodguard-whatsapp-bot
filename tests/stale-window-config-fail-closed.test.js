'use strict';
// Offline, isolated-child-process configuration regression tests.
// No Firebase connection, WhatsApp account, recipients or hardware actions.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function evaluateFreshness(config) {
  const script = [
    "const { isStale } = require('./src/floodguard');",
    "const snapshot = age => ({ system: { lastUpdate: Date.now() - age } });",
    "process.stdout.write(JSON.stringify([isStale(snapshot(2000)), isStale(snapshot(65000))]));"
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLOODGUARD_STALE_MS: config },
    encoding: 'utf8',
    timeout: 10000
  });
  assert.equal(run.status, 0, run.stderr || 'isolated freshness probe failed');
  return JSON.parse(run.stdout);
}

test('malformed freshness settings cannot make past observations appear LIVE', () => {
  for (const config of ['invalid', 'NaN', 'Infinity', '-15000', '0', '1.5', '999999999']) {
    assert.deepEqual(evaluateFreshness(config), [true, true], config);
  }
});

test('bounded configured freshness remains functional for valid values', () => {
  for (const config of ['1000', '5000', '15000', '60000']) {
    const [recent, old] = evaluateFreshness(config);
    if (config === '1000') assert.equal(recent, true);
    else assert.equal(recent, false, config);
    assert.equal(old, true, config);
  }
});
