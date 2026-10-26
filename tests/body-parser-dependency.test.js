'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lock = require('../package-lock.json');

test('transitive Express body-parser dependency is patched and its lockfile remains consistent', () => {
  const parser = lock.packages['node_modules/body-parser'];
  const nestedQs = lock.packages['node_modules/body-parser/node_modules/qs'] || lock.packages['node_modules/qs'];
  assert.equal(parser.version, '1.20.9');
  assert.equal(parser.dependencies.qs, '~6.16.0');
  assert.match(nestedQs.version, /^6\.16\./);
  assert.match(parser.integrity, /^sha512-/);
  assert.match(nestedQs.integrity, /^sha512-/);
});
