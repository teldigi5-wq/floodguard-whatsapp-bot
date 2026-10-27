'use strict';
// Synthetic subprocess regression for a canonical recipient file vanishing
// between the initial lstat/marker check and the later JSON read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('unexpected ENOENT after a recorded subscriber exists never becomes empty recipients', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-subscriber-race-'));
  const recipient = 'synthetic-race@s.whatsapp.net';
  const script = String.raw`
    'use strict';
    const fs = require('node:fs');
    const path = require('node:path');
    const { subscribe, getSubscribers } = require('./src/store');
    subscribe('synthetic-race@s.whatsapp.net');
    const current = fs.readFileSync;
    const expected = path.join(process.env.DATA_PATH, 'subscribers.json');
    fs.readFileSync = function(pathArg, ...args) {
      if (String(pathArg) === expected) {
        const error = new Error('synthetic file lost between checks');
        error.code = 'ENOENT';
        throw error;
      }
      return current.call(this, pathArg, ...args);
    };
    try {
      const subscribers = getSubscribers();
      process.stdout.write('UNSAFE_EMPTY_' + subscribers.size);
      process.exitCode = 1;
    } catch (error) {
      if (/subscriber.*(recovery|backup)/i.test(error.message) &&
          !error.message.includes('synthetic file lost')) {
        process.stdout.write('BLOCKED');
      } else {
        process.stdout.write('UNSAFE_ERROR');
        process.exitCode = 1;
      }
    } finally {
      fs.readFileSync = current;
    }
  `.replace(/^\s{4}/gm,'');
  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
      timeout: 3000, maxBuffer: 16384,
      env: { ...process.env, DATA_PATH: dir }
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'BLOCKED');
    assert.equal(result.stderr, '');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dir, 'subscribers.json'), 'utf8')),
      [recipient],
      'test-only injected read loss must not mutate canonical records'
    );
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});
