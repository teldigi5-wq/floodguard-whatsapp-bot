#!/usr/bin/env node
'use strict';
// Explicit, local-only first-install initialization. NOT a recovery/unlock
// mechanism; no WhatsApp, Firebase, network, credentials or subscriber writes.
const fs = require('node:fs');
const path = require('node:path');

const refuse = () => {
  process.stdout.write('STATE_BOOTSTRAP_REFUSED\n');
  process.exitCode = 3;
};
try {
  if (process.argv.length !== 3 ||
      process.argv[2] !== '--acknowledge-new-installation') {
    refuse();
  } else {
    const dir = process.env.DATA_PATH;
    // Require a deliberately selected existing directory; do not guess CWD.
    if (!dir || !path.isAbsolute(dir)) {
      refuse();
    } else {
      const metadata = fs.lstatSync(dir);
      if (!metadata.isDirectory() || metadata.isSymbolicLink() ||
          fs.readdirSync(dir).length !== 0) {
        refuse(); // Any pre-existing data implies possible prior operation.
      } else {
        const { saveState } = require('../src/store');
        saveState({
          initialized: false, level: 'UNKNOWN', gateStatus: 'UNKNOWN',
          procedureId: null, sentCountdown: [], deliveryUncertain: false,
          deliveryDegraded: false, alertSendFailureCount: 0
        });
        process.stdout.write('NEW_INSTALLATION_STATE_INITIALIZED\n');
      }
    }
  }
} catch {
  // Do not leak paths, private state or OS error messages.
  refuse();
}
