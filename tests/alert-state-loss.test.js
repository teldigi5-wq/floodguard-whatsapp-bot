'use strict';
// Synthetic state-loss tests: no network, credentials, account or hardware.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-state-loss-'));
process.env.DATA_PATH = dir;
const { getState, saveState, subscribe } = require('../src/store');
const { processLiveChange } = require('../src/floodguard');
const canonical = path.join(dir, 'state.json');
const marker = path.join(dir, 'state.ever-recorded');
const state = (overrides = {}) => ({
  initialized: true, level: 'SAFE', gateStatus: 'CLOSED',
  procedureId: null, sentCountdown: [], deliveryUncertain: false,
  ...overrides
});
const reading = (distanceCm, ts) => ({
  water: { distanceCm },
  gate: { angle: 0, status: 'CLOSED', countdownSeconds: 0 },
  alarm: { active: false },
  system: { overallRisk: 'HIGH', lastUpdate: ts }
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a fresh or missing canonical state cannot be silently treated as initialized', () => {
  assert.equal(fs.existsSync(canonical), false);
  assert.throws(() => getState(), /missing.*state.*manual/i);
  assert.equal(fs.existsSync(canonical), false);
});

test('initial private fixture persists a marker before the canonical state', () => {
  saveState(state({ deliveryUncertain: true, deliveryDegraded: true }));
  assert.equal(fs.lstatSync(marker).isFile(), true);
  assert.equal(fs.lstatSync(marker).isSymbolicLink(), false);
  assert.equal(fs.statSync(marker).mode & 0o077, 0);
  assert.equal(getState().deliveryUncertain, true);
});

test('deletion after a recorded uncertain send cannot silently recreate state', () => {
  const oldMarker = fs.readFileSync(marker);
  fs.unlinkSync(canonical);
  assert.throws(() => getState(), /missing.*state.*manual/i);
  assert.throws(() => saveState(state({ deliveryUncertain: false })), /manual.*recovery|state.*missing/i);
  assert.deepEqual(fs.readFileSync(marker), oldMarker);
  assert.equal(fs.existsSync(canonical), false);
});

test('a restarted process refuses the missing state before attempting WhatsApp send', () => {
  const script = [
    "const { processLiveChange } = require('./src/floodguard');",
    "let attempted = 0;",
    "const sock = { sendMessage: async () => { attempted++; } };",
    "processLiveChange(sock, { water: {distanceCm: 13},",
    "gate: {angle: 0, status: 'CLOSED', countdownSeconds: 0},",
    "system: {lastUpdate: Date.now() - 1000, overallRisk: 'HIGH'}",
    "}).then(() => { process.stdout.write('UNSAFE'); process.exitCode = 1; },",
    "error => { process.stdout.write(attempted === 0 && /manual|state.*missing/i.test(error.message)",
    "? 'BLOCKED' : 'UNSAFE'); if (attempted !== 0) process.exitCode = 1; });"
  ].join('\n');
  const run = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATA_PATH: dir },
    encoding: 'utf8', timeout: 3000, maxBuffer: 32 * 1024
  });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, 'BLOCKED');
  assert.equal(run.stderr, '');
  assert.equal(fs.existsSync(canonical), false);
});

test('existing legacy canonical state without a marker can migrate on the next safe save', () => {
  fs.unlinkSync(marker);
  fs.writeFileSync(canonical, JSON.stringify(state({ deliveryUncertain: true })), { mode: 0o600 });
  assert.equal(getState().deliveryUncertain, true);
  saveState(state({ deliveryUncertain: true, lastSeenAt: 123 }));
  assert.equal(fs.lstatSync(marker).isFile(), true);
  assert.equal(getState().deliveryUncertain, true);
});

test('loss during an in-flight fake send prevents recreation and all later sends', async () => {
  saveState(state());
  subscribe('synthetic-recipient@s.whatsapp.net');
  let sends = 0;
  const sock = { sendMessage: async () => { sends++; fs.unlinkSync(canonical); } };
  await assert.rejects(
    processLiveChange(sock, reading(13, Date.now() - 1000)),
    /manual.*recovery|state.*missing/i
  );
  assert.equal(sends, 1, 'first transport invocation may already be externally visible');
  assert.equal(fs.existsSync(canonical), false);
  await assert.rejects(
    processLiveChange(sock, reading(21, Date.now() - 500)),
    /missing.*state.*manual/i
  );
  assert.equal(sends, 1, 'no replay or later automatic warning may proceed after loss');
});


test('the offline bootstrap requires explicit acknowledgement and an empty absolute directory', () => {
  const separate = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-bootstrap-'));
  const script = path.resolve(__dirname, '../scripts/bootstrap-alert-state.js');
  const run = (args = [], dataPath = separate) => spawnSync(process.execPath,
    [script, ...args], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
      timeout: 3000, maxBuffer: 16 * 1024,
      env: { ...process.env, DATA_PATH: dataPath, TEST_SECRET: 'synthetic-private-token' }
    });
  try {
    for (const args of [[], ['--force'], ['--acknowledge-new-installation', 'extra']]) {
      const failed = run(args);
      assert.equal(failed.status, 3);
      assert.equal(failed.stdout, 'STATE_BOOTSTRAP_REFUSED\n');
      assert.equal(failed.stderr, '');
      assert.deepEqual(fs.readdirSync(separate), []);
    }
    assert.equal(run(['--acknowledge-new-installation'], 'relative-folder').status, 3);
    const accepted = run(['--acknowledge-new-installation']);
    assert.equal(accepted.status, 0);
    assert.equal(accepted.stdout, 'NEW_INSTALLATION_STATE_INITIALIZED\n');
    assert.equal(accepted.stderr, '');
    assert.deepEqual(fs.readdirSync(separate).sort(), ['state.ever-recorded', 'state.json']);
    const first = JSON.parse(fs.readFileSync(path.join(separate, 'state.json'), 'utf8'));
    assert.equal(first.initialized, false);
    assert.equal(first.deliveryUncertain, false);
    assert.equal(fs.statSync(path.join(separate, 'state.json')).mode & 0o077, 0);
    assert.equal(run(['--acknowledge-new-installation']).status, 3, 'never reset an existing installation');
    fs.unlinkSync(path.join(separate, 'state.json'));
    assert.equal(run(['--acknowledge-new-installation']).status, 3,
      'missing state plus an independent marker is an incident, not new installation');
    assert.equal(fs.existsSync(path.join(separate, 'state.json')), false);
  } finally {
    fs.rmSync(separate, { recursive: true, force: true });
  }
});

test('corrupt state is preserved for private operator review', () => {
  fs.writeFileSync(canonical, '{"deliveryUncertain":false,"token":"synthetic-secret"');
  const before = fs.readFileSync(canonical);
  assert.throws(() => getState(), /corrupt.*state|corrupt.*local/i);
  assert.deepEqual(fs.readFileSync(canonical), before);
});
