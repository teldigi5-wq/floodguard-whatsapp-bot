'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('live WhatsApp entrypoint never exposes exception contents or account identity in diagnostics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
  // An Error can include a private Firebase URL, auth parameter, local
  // session path or an account identifier. Never interpolate it into a
  // browser-visible lastError field or send it directly to host logs.
  assert.doesNotMatch(source, /\b(?:e|error)\.message\b/,
    'raw exception message must not reach status or logs');
  assert.doesNotMatch(source, /console\.error\(\s*(?:e|error)\s*\)/,
    'raw exception objects can contain nested secrets');
  assert.doesNotMatch(source, /console\.error\(\s*'[^']+'\s*,\s*(?:e|error)\s*\)/,
    'logs must not print private exception objects');
  assert.doesNotMatch(source, /console\.log\(\s*'WhatsApp connected'\s*,\s*num\s*\)/,
    'account identity should not be printed as a connection log');
  assert.doesNotMatch(source, /lastError\s*=\s*\x60[^\x60]*\$\{[^}]+\}/,
    'lastError must contain a fixed redacted diagnostic only');
  // The protected admin interface must still restrict internal status/QR.
  assert.match(source, /app\.get\('\/status', requireSetupAdmin,/);
  assert.match(source, /app\.get\('\/qr', requireSetupAdmin,/);
});
