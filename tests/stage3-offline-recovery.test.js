'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {syntheticState,createSyntheticBackup,verifySyntheticBackup,runOfflineRecoveryDrill}=require('../scripts/offline-recovery-drill');

test('recovery fixture is explicitly unavailable and cannot represent operational data',()=>{
  const sample=syntheticState();
  assert.equal(sample.demoMode,true);
  assert.equal(sample.source,'SYNTHETIC ONLY');
  assert.equal(sample.risk,'UNAVAILABLE');
  assert.equal(sample.water,null);
  assert.equal(sample.firebase,'NOT CONNECTED');
  assert.equal(sample.whatsapp,'NOT CONNECTED');
  assert.equal(sample.hardwareControlEnabled,false);
  assert.equal(sample.deliveryEnabled,false);
});
test('snapshot checksum detects alteration and rejects real/non-synthetic payloads',()=>{
  const envelope=createSyntheticBackup();
  assert.deepEqual(verifySyntheticBackup(envelope),syntheticState());
  envelope.payload.water=19.2;
  assert.throws(()=>verifySyntheticBackup(envelope),/checksum mismatch/);
  envelope.sha256='not a checksum';
  assert.throws(()=>verifySyntheticBackup(envelope),/Invalid synthetic backup format/);
  const malformed=createSyntheticBackup();
  malformed.payload.kind='REAL_SESSION';
  const crypto=require('node:crypto');
  malformed.sha256=crypto.createHash('sha256').update(JSON.stringify(malformed.payload)).digest('hex');
  assert.throws(()=>verifySyntheticBackup(malformed),/fixed synthetic offline fixture/);
  assert.throws(()=>verifySyntheticBackup(null),/Invalid synthetic backup format/);
});
test('temporary snapshot restore and deliberate corruption drill leave no persistent files',()=>{
  const outcome=runOfflineRecoveryDrill();
  assert.deepEqual(outcome,{
    mode:'SYNTHETIC OFFLINE ONLY',verified:true,restored:true,
    tamperingRejected:true,temporaryFilesRemoved:true,
    actualSessionBackupCreated:false,externalServicesContacted:false
  });
});
test('dry-run CLI emits no secrets or paths and exits successfully',()=>{
  const run=spawnSync(process.execPath,['scripts/offline-recovery-drill.js'],{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:12000,
    env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT||''}
  });
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/synthetic recovery drill: PASS/);
  assert.match(run.stdout,/does not validate a real encrypted backup/);
  assert.doesNotMatch(run.stdout,/FLOODGUARD_SETUP_TOKEN=|auth\/|DATA_PATH=|subscribers\.json|https:\/\//);
});
test('recovery rehearsal source cannot import real messaging, session store, Firebase or bot',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/offline-recovery-drill.js'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:@whiskeysockets\/baileys|\.\.\/src\/firebase|\.\.\/src\/store|\.\.\/bot)['"]\)/);
  assert.doesNotMatch(source,/\bfetch\(|https\.request\(|http\.request\(|sendMessage\(|useMultiFileAuthState\(|process\.env/);
  assert.match(source,/mkdtempSync/);
  assert.match(source,/rmSync\(dir/);
});
