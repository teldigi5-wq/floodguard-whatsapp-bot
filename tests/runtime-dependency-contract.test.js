'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pino = require('pino');
const dotenv = require('dotenv');

test('Baileys logger preserves Pino child and level methods', () => {
  const logger = pino({ level: 'silent' });
  assert.equal(typeof logger.child, 'function');
  const child = logger.child({ component: 'synthetic-baileys-contract' });
  for (const method of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    assert.equal(typeof logger[method], 'function', `parent logger: ${method}`);
    assert.equal(typeof child[method], 'function', `child logger: ${method}`);
  }
  child.info({ safe: 'synthetic' }, 'no live account is used');
});

test('dotenv loads an isolated file without overriding existing environment values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'floodguard-dotenv-contract-'));
  const key = 'FLOODGUARD_SYNTHETIC_DOTENV_CONTRACT';
  const previous = process.env[key];
  const wasPresent = Object.hasOwn(process.env, key);
  const file = path.join(directory, '.env');
  try {
    fs.writeFileSync(file, key + '=isolated-synthetic-value\n');
    process.env[key] = 'existing-synthetic-value';
    const first = dotenv.config({ path: file, override: false, quiet: true });
    assert.equal(first.error, undefined);
    assert.equal(first.parsed[key], 'isolated-synthetic-value');
    assert.equal(process.env[key], 'existing-synthetic-value');
    delete process.env[key];
    const second = dotenv.config({ path: file, override: false, quiet: true });
    assert.equal(second.error, undefined);
    assert.equal(process.env[key], 'isolated-synthetic-value');
  } finally {
    if (wasPresent) process.env[key] = previous;
    else delete process.env[key];
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
