'use strict';
// Synthetic-only subscriber recovery tests; no network, WhatsApp account,
// production Firebase, or physical flood hardware is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-subscriber-loss-'));
process.env.DATA_PATH = dir;
const {getSubscribers, subscribe, unsubscribe, saveState} = require('../src/store');
const {processLiveChange} = require('../src/floodguard');
const recipientsFile = path.join(dir, 'subscribers.json');
const marker = path.join(dir, 'subscribers.ever-recorded');
const one = 'synthetic-first@s.whatsapp.net';
const two = 'synthetic-second@s.whatsapp.net';
const fixture = (overrides={}) => ({
  initialized:true, level:'SAFE', gateStatus:'CLOSED',
  procedureId:null, sentCountdown:[], deliveryUncertain:false, ...overrides
});
const live = () => ({
  water:{distanceCm:13}, gate:{status:'CLOSED',angle:0,countdownSeconds:0},
  alarm:{active:false}, system:{lastUpdate:Date.now()-1000, overallRisk:'HIGH'}
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

test('genuinely new installation may have no registered recipients',()=>{
  assert.equal(fs.existsSync(recipientsFile),false);
  assert.deepEqual([...getSubscribers()],[]);
  assert.equal(fs.existsSync(marker),false);
});

test('first enrollment persists an owner-only subscriber-recorded marker',()=>{
  subscribe(one);
  assert.deepEqual([...getSubscribers()],[one]);
  assert.equal(fs.lstatSync(marker).isFile(),true);
  assert.equal(fs.lstatSync(marker).isSymbolicLink(),false);
  assert.equal(fs.statSync(marker).mode & 0o077,0);
  assert.equal(fs.statSync(recipientsFile).mode & 0o077,0);
});

test('unexpected subscriber-file deletion fails closed rather than silently clearing recipients',()=>{
  const oldMarker = fs.readFileSync(marker);
  fs.unlinkSync(recipientsFile);
  assert.throws(()=>getSubscribers(),/subscriber.*manual recovery required/i);
  assert.throws(()=>subscribe(two),/subscriber.*manual recovery required/i);
  assert.deepEqual(fs.readFileSync(marker),oldMarker);
  assert.equal(fs.existsSync(recipientsFile),false);
});

test('process restart recognizes lost subscriber list without logging private identifiers',()=>{
  const code = [
    "const {getSubscribers}=require('./src/store');",
    "try { getSubscribers(); process.stdout.write('UNSAFE'); process.exitCode=1; }",
    "catch (error) { process.stdout.write(/subscriber.*manual recovery required/i.test(error.message)?'BLOCKED':'UNSAFE'); }"
  ].join('\n');
  const result=spawnSync(process.execPath,['-e',code],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,DATA_PATH:dir},
    encoding:'utf8',timeout:3000,maxBuffer:16384
  });
  assert.equal(result.status,0);
  assert.equal(result.stdout,'BLOCKED');
  assert.equal(result.stderr,'');
});

test('preexisting legacy subscriber file is sealed on its first trusted read',()=>{
  fs.unlinkSync(marker);
  fs.writeFileSync(recipientsFile,JSON.stringify([one]),{mode:0o600});
  assert.deepEqual([...getSubscribers()],[one]);
  assert.equal(fs.lstatSync(marker).isFile(),true);
  assert.equal(fs.statSync(marker).mode & 0o077,0);
});

test('symlinked subscriber file is rejected without accessing or rewriting its target',()=>{
  const target=path.join(dir,'synthetic-private-target');
  fs.writeFileSync(target,JSON.stringify([one]),{mode:0o600});
  fs.unlinkSync(recipientsFile);
  fs.symlinkSync(target,recipientsFile);
  const before=fs.readFileSync(target);
  assert.throws(()=>getSubscribers(),/subscriber.*manual recovery required/i);
  assert.throws(()=>subscribe(two),/subscriber.*manual recovery required/i);
  assert.deepEqual(fs.readFileSync(target),before);
  fs.unlinkSync(recipientsFile);
  fs.writeFileSync(recipientsFile,JSON.stringify([one,two]),{mode:0o600});
});

test('losing subscriber file during first fake send prevents a second recipient',async()=>{
  saveState(fixture());
  let attempted=0;
  const sock={sendMessage:async()=>{attempted++;if(attempted===1)fs.unlinkSync(recipientsFile);}};
  await assert.rejects(processLiveChange(sock,live()),/subscriber.*manual recovery required/i);
  assert.equal(attempted,1,'cannot silently contact remaining recipients after subscriber loss');
  assert.equal(fs.existsSync(recipientsFile),false);
  // Restore only synthetic fixture for the next isolated test.
  fs.writeFileSync(recipientsFile,JSON.stringify([one,two]),{mode:0o600});
});

test('unsubscribe during a fake batch prevents delivery to removed next recipient',async()=>{
  saveState(fixture());
  let attempted=0;
  const sock={sendMessage:async()=>{attempted++;if(attempted===1)unsubscribe(two);}};
  await processLiveChange(sock,live());
  assert.equal(attempted,1);
  assert.deepEqual([...getSubscribers()],[one]);
});
