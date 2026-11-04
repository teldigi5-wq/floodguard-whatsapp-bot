'use strict';

// R3 H14 active-runtime denial tests: exercise the ACTUAL bot.js executable
// in a disposable working directory. No Firebase, WhatsApp, network,
// subscriber enrollment, gate, operator credentials or real DATA_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { liveOperationDecision } = require('../src/operationalAuthority');

const ENTRY = path.resolve(__dirname, '../bot.js');
const source = fs.readFileSync(ENTRY, 'utf8');

test('unaccepted H11 signer, witness and fallback make live permission immutable NO-GO', () => {
  const policy = liveOperationDecision();
  assert.equal(Object.isFrozen(policy), true);
  assert.deepEqual({
    releaseDecision: policy.releaseDecision,
    operationalStartupAllowed: policy.operationalStartupAllowed,
    automaticAlertsAllowed: policy.automaticAlertsAllowed,
    sourceIdentityAuthenticated: policy.sourceIdentityAuthenticated,
    independentWitnessVerified: policy.independentWitnessVerified,
    approvedFallbackRecorded: policy.approvedFallbackRecorded,
  }, {
    releaseDecision:'NO_GO',
    operationalStartupAllowed:false,
    automaticAlertsAllowed:false,
    sourceIdentityAuthenticated:false,
    independentWitnessVerified:false,
    approvedFallbackRecorded:false,
  });
  assert.equal(liveOperationDecision(), policy);
});

test('startup denial executes before dotenv, sessions, sockets, HTTP or Firebase imports', () => {
  const guard = source.indexOf("const { liveOperationDecision } = require('./src/operationalAuthority');");
  const exit = source.indexOf('process.exit(78);');
  const dotenv = source.indexOf("require('dotenv').config();");
  const networkImports = [
    "require('express')", "require('@whiskeysockets/baileys')",
    "require('./src/firebase')", "require('./src/store')",
  ];
  assert.ok(guard >= 0 && exit > guard && dotenv > exit);
  for (const line of networkImports) {
    assert.ok(source.indexOf(line) > exit, line);
  }
  assert.match(source.slice(guard, exit), /sourceIdentityAuthenticated !== true/);
  assert.match(source.slice(guard, exit), /independentWitnessVerified !== true/);
  assert.match(source.slice(guard, exit), /approvedFallbackRecorded !== true/);
});

for (const [name, overrides] of Object.entries({
  default: {},
  'falsely set production environment': { NODE_ENV: 'production' },
  'fabricated operator approval and witness flags': {
    FLOODGUARD_RELEASE_APPROVED:'true',
    FLOODGUARD_WITNESS_VERIFIED:'true',
    FLOODGUARD_ALLOW_UNSIGNED_ALERTS:'true',
  },
  'attempted nonproduction override': {
    FLOODGUARD_HOST_MODE:'pc',
    FLOODGUARD_QA_MODE:'true',
    FLOODGUARD_ENABLE_BOT:'true',
  },
})) {
  test('actual bot.js refuses ' + name + ' without network or local writes', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-h14-startup-'));
    try {
      const dataPath = path.join(cwd, 'private-synthetic-state');
      const secret = 'SYNTHETIC_DO_NOT_PRINT_SECRET';
      const result = spawnSync(process.execPath, [ENTRY], {
        cwd, timeout:2000, maxBuffer:64*1024, encoding:'utf8',
        env:{
          ...process.env, ...overrides,
          DATA_PATH:dataPath,
          FIREBASE_AUTH:secret,
          FIREBASE_DATABASE_URL:'https://example-test.firebaseio.com/?auth='+secret,
          FLOODGUARD_SETUP_TOKEN:secret,
        },
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.signal, null);
      assert.equal(result.status, 78, result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /operational startup blocked/);
      assert.match(result.stderr, /approved manual warning procedure/);
      assert.doesNotMatch(result.stderr, /SYNTHETIC_DO_NOT_PRINT_SECRET|example-test|private-synthetic-state/);
      assert.equal(fs.existsSync(dataPath), false, 'no session folder or state may be created');
      assert.deepEqual(fs.readdirSync(cwd), [], 'no application file writes before denial');
    } finally {
      fs.rmSync(cwd,{recursive:true,force:true});
    }
  });
}
