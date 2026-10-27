'use strict';
// Synthetic private-store boundary tests: no Firebase, live WhatsApp,
// production recipient information or physical flood hardware.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-canonical-boundary-'));
  try { fn(dir); } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
function offlineScript(dir,body) {
  const result=spawnSync(process.execPath,['-e',body],{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',
    env:{...process.env,DATA_PATH:dir,PRIVATE_FAKE_TOKEN:'synthetic-secret'},
    timeout:5000,maxBuffer:32768
  });
  assert.equal(result.stderr,'');
  assert.doesNotMatch(result.stdout,/synthetic-secret|fg-canonical-boundary|@s\.whatsapp\.net/);
  return result;
}

test('runtime refuses oversized alert-state JSON without modifying it or dispatching',()=>{
  fixture(dir=>{
    const file=path.join(dir,'state.json');
    // Syntactically valid and formally structured: size alone is unsafe.
    const value={
      initialized:true,level:'SAFE',gateStatus:'CLOSED',
      sentCountdown:[],deliveryUncertain:false,
      oversizedPadding:'synthetic-private-'.repeat(8500)
    };
    fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
    const before=fs.readFileSync(file);
    assert.ok(before.length>128*1024);
    const script=[
      "const { getState }=require('./src/store');",
      "const {processLiveChange}=require('./src/floodguard');",
      "let sends=0;",
      "const live={water:{distanceCm:13},gate:{status:'CLOSED',angle:0},system:{lastUpdate:Date.now()-1000}};",
      "processLiveChange({sendMessage:async()=>{sends++;}},live).then(",
      "()=>{process.stdout.write('UNSAFE');process.exitCode=1;},",
      "error=>{if(sends===0&&/state.json.*oversized.*manual recovery/i.test(error.message)){",
      "process.stdout.write('BLOCKED');}else{process.stdout.write('UNSAFE');process.exitCode=1;}});"
    ].join('\n');
    const r=offlineScript(dir,script);
    assert.equal(r.status,0);
    assert.equal(r.stdout,'BLOCKED');
    assert.deepEqual(fs.readFileSync(file),before,'oversized state preserved for private review');
  });
});

test('runtime rejects duplicate recipients rather than normalizing altered enrollment',()=>{
  fixture(dir=>{
    const file=path.join(dir,'subscribers.json');
    const marker=path.join(dir,'subscribers.ever-recorded');
    const jid='synthetic-person@s.whatsapp.net';
    fs.writeFileSync(file,JSON.stringify([jid,jid]),{mode:0o600});
    fs.writeFileSync(marker,'floodguard-subscribers-recorded-v1\n',{mode:0o600});
    const before=fs.readFileSync(file);
    const script=[
      "const {getSubscribers,subscribe}=require('./src/store');",
      "try{getSubscribers();process.stdout.write('UNSAFE');process.exitCode=1;}",
      "catch(error){if(/subscriber.*manual.*recovery/i.test(error.message)){",
      "process.stdout.write('BLOCKED');}else{process.stdout.write('UNSAFE');process.exitCode=1;}}"
    ].join('\n');
    const r=offlineScript(dir,script);
    assert.equal(r.status,0);
    assert.equal(r.stdout,'BLOCKED');
    assert.deepEqual(fs.readFileSync(file),before,'duplicated private consent records untouched');
  });
});

test('small valid state and unique registered recipient still load unchanged',()=>{
  fixture(dir=>{
    const state={
      initialized:true,level:'SAFE',gateStatus:'CLOSED',
      sentCountdown:[],deliveryUncertain:false
    };
    const jid='synthetic-person@s.whatsapp.net';
    fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(state),{mode:0o600});
    fs.writeFileSync(path.join(dir,'state.ever-recorded'),'floodguard-state-recorded-v1\n',{mode:0o600});
    fs.writeFileSync(path.join(dir,'subscribers.json'),JSON.stringify([jid]),{mode:0o600});
    fs.writeFileSync(path.join(dir,'subscribers.ever-recorded'),'floodguard-subscribers-recorded-v1\n',{mode:0o600});
    const script=[
      "const {getState,getSubscribers}=require('./src/store');",
      "if(getState().level==='SAFE'&&getSubscribers().size===1){",
      "process.stdout.write('VALID');}else{process.stdout.write('UNSAFE');process.exitCode=1;}"
    ].join('\n');
    const r=offlineScript(dir,script);
    assert.equal(r.status,0);
    assert.equal(r.stdout,'VALID');
  });
});
