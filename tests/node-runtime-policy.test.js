import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const minimum = '^22.23.4 || ^24.22.1 || ^26.12.1';

test('package and lockfile agree on Brotli-patched supported Node lines', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(pkg.engines.node, minimum);
  assert.equal(lock.packages[''].engines.node, minimum);
  assert.equal(readFileSync('.nvmrc', 'utf8').trim(), '22.23.4');
  assert.match(readFileSync('.npmrc', 'utf8'), /^engine-strict=true\\n?$/);
});
