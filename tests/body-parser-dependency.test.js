'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const lock = require('../package-lock.json');

const numeric = value => String(value || '').split('.').slice(0, 3).map(Number);
function atLeast(actual, required) {
  const a = numeric(actual), b = numeric(required);
  return [0,1,2].reduce((cmp, i) => cmp || Math.sign((a[i] || 0) - (b[i] || 0)), 0) >= 0;
}

test('Express 4/5 upgrades must carry the compatible patched body-parser and qs', () => {
  const express = lock.packages['node_modules/express'];
  const parser = lock.packages['node_modules/body-parser'];
  const qs = lock.packages['node_modules/body-parser/node_modules/qs'] || lock.packages['node_modules/qs'];
  assert.ok(express && parser && qs, 'lockfile must contain actual installed dependencies');
  const major = Number(express.version.split('.')[0]);
  assert.ok([4,5].includes(major), 'new Express major requires a deliberate migration review');
  assert.equal(Number(String(manifest.dependencies.express).match(/\d+/)?.[0]), major,
    'manifest and lock must be from the same Express major');
  assert.equal(Number(String(lock.packages[''].dependencies.express).match(/\d+/)?.[0]), major);
  assert.equal(Number(parser.version.split('.')[0]), major === 4 ? 1 : 2);
  assert.ok(atLeast(parser.version, major === 4 ? '1.20.9' : '2.4.0'),
    'body-parser must retain the patched minimum for its Express major');
  assert.ok(atLeast(qs.version, '6.16.0'), 'qs must retain its patched minimum');
  assert.match(parser.integrity, /^sha512-/);
  assert.match(qs.integrity, /^sha512-/);
});
