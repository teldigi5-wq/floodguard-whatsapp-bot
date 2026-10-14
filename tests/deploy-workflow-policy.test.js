'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.resolve(__dirname,'../.github/workflows/deploy.yml'),'utf8');

test('EC2 deployment is manual, not triggered by main pushes', () => {
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.doesNotMatch(workflow, /^  workflow_run:/m);
  assert.match(workflow, /environment: floodguard-ec2-production/);
});
test('production restart requires explicit approval and pinned revision', () => {
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /approve_restart:/);
  assert.match(workflow, /if \[\[ "\$APPROVAL" != "DEPLOY" \]\]/);
  assert.match(workflow, /\^\[a-fA-F0-9\]\{40\}\$/);
  assert.match(workflow, /git reset --hard "\$EXPECTED_SHA"/);
  assert.match(workflow, /\[ "\$actual" != "\$EXPECTED_SHA" \]/);
});
test('only SSH job, not merely GitHub source merge, can restart PM2', () => {
  assert.match(workflow, /pm2 restart floodguard-whatsapp-bot/);
  assert.match(workflow, /envs: EXPECTED_SHA/);
  assert.match(workflow, /if \[\[ -z "\$EC2_HOST" \|\| -z "\$EC2_KEY" \]\]/);
});
