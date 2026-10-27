'use strict';
// Offline-only operator recovery and honest subscription/status fixtures.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-delivery-recovery-'));
process.env.DATA_PATH=dir;
const {saveState,getState}=require('../src/store');
const {commandReply}=require('../src/floodguard');
const {assessDeliveryState}=require('../src/deliveryRecovery');
const inspect=path.resolve(__dirname,'../scripts/inspect-delivery-recovery.js');
const localFile=path.join(dir,'state.json');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const live=()=>({water:{distanceCm:13,status:'DANGER'},
  gate:{status:'CLOSED',angle:0,countdownSeconds:0},
  alarm:{active:false},system:{lastUpdate:Date.now()-1000,overallRisk:'HIGH'}});
const state=(overrides={})=>({
  initialized:true,level:'DANGER',gateStatus:'CLOSED',
  procedureId:null,sentCountdown:[],lastSourceAt:Date.now()-1500,
  alertSendFailureCount:1,deliveryUncertain:true,deliveryDegraded:true,
  lastDeliveryFailureAt:Date.now()-1000,
  ...overrides
});
const run=(dataDir=dir)=>spawnSync(process.execPath,[inspect],{
  encoding:'utf8',timeout:1800,maxBuffer:64*1024,
  env:{...process.env,DATA_PATH:dataDir,MOCK_PRIVATE_TOKEN:'synthetic-private-token'}
});
const resultOf=r=>{assert.equal(r.stderr,'','report must not expose raw errors');return JSON.parse(r.stdout.trim());};

test('read-only policy reports paused delivery and requires human recovery',()=>{
  const original=state();
  const value=assessDeliveryState(original);
  assert.deepEqual(value,{
    status:'PAUSED_UNCERTAIN_DELIVERY',automaticAlertsPaused:true,
    operatorReviewRequired:true,manualFallbackRequired:true
  });
  assert.deepEqual(original,state({lastSourceAt:original.lastSourceAt,
    lastDeliveryFailureAt:original.lastDeliveryFailureAt}));
});

test('degraded-but-not-quarantined remains distinguished from paused delivery',()=>{
  assert.deepEqual(assessDeliveryState(state({deliveryUncertain:false})),{
    status:'DELIVERY_DEGRADED',automaticAlertsPaused:false,
    operatorReviewRequired:true,manualFallbackRequired:true
  });
  assert.deepEqual(assessDeliveryState(state({
    alertSendFailureCount:0,deliveryUncertain:false,deliveryDegraded:false
  })),{
    status:'NO_RECORDED_FAILURE',automaticAlertsPaused:false,
    operatorReviewRequired:false,manualFallbackRequired:false
  });
});

test('status, risk, emergency and subscription reveal paused automatic alerts',async()=>{
  saveState(state());
  const before=fs.readFileSync(localFile,'utf8');
  for(const cmd of ['stats','status','risk','emergency']){
    const text=await commandReply('synthetic-operator@s.whatsapp.net',cmd,live);
    assert.match(text,/ALERT DELIVERY PAUSED/i);
    assert.match(text,/manual/i);
  }
  const enrollment=await commandReply('synthetic-operator@s.whatsapp.net','subscribe',live);
  assert.match(enrollment,/ALERT DELIVERY PAUSED/i);
  assert.doesNotMatch(enrollment,/you will receive/i);
  assert.equal(fs.readFileSync(localFile,'utf8'),before,
    'read-only health/subscribe diagnostics may not modify the quarantine');
  assert.equal(getState().deliveryUncertain,true);
});

test('degraded history warns without claiming all sends are stopped',async()=>{
  saveState(state({deliveryUncertain:false}));
  const reply=await commandReply('synthetic-operator@s.whatsapp.net','status',live);
  assert.match(reply,/DELIVERY DEGRADED/i);
  assert.doesNotMatch(reply,/ALERT DELIVERY PAUSED/i);
});

test('local report is read-only, redacted and exits nonzero for paused delivery',()=>{
  saveState(state({privateJid:'synthetic-sensitive@s.whatsapp.net',
    authUrl:'https://example.invalid/?auth=synthetic-secret'}));
  const before=fs.readFileSync(localFile);
  const mtime=fs.statSync(localFile).mtimeMs;
  const r=run();
  assert.equal(r.status,2);
  assert.deepEqual(resultOf(r),assessDeliveryState(getState()));
  assert.deepEqual(fs.readFileSync(localFile),before);
  assert.equal(fs.statSync(localFile).mtimeMs,mtime);
  assert.doesNotMatch(r.stdout,/synthetic-sensitive|synthetic-secret|example.invalid|privateJid|authUrl/);
});

test('local report refuses missing or invalid state and never silently resets it',()=>{
  const separate=fs.mkdtempSync(path.join(os.tmpdir(),'fg-no-recovery-state-'));
  try {
    assert.equal(run(separate).status,3);
    assert.deepEqual(resultOf(run(separate)),{
      status:'INSPECTION_FAILED',automaticAlertsPaused:null,
      operatorReviewRequired:true,manualFallbackRequired:true
    });
    assert.deepEqual(fs.readdirSync(separate),[]);
    fs.writeFileSync(path.join(separate,'state.json'),
      '{"deliveryUncertain":false,"secret":"synthetic-private-token"');
    const corrupt=fs.readFileSync(path.join(separate,'state.json'),'utf8');
    const r=run(separate);
    assert.equal(r.status,3);
    assert.deepEqual(resultOf(r),{
      status:'INSPECTION_FAILED',automaticAlertsPaused:null,
      operatorReviewRequired:true,manualFallbackRequired:true
    });
    assert.equal(fs.readFileSync(path.join(separate,'state.json'),'utf8'),corrupt);
    assert.doesNotMatch(r.stdout,/synthetic-private-token/);
  }finally{fs.rmSync(separate,{recursive:true,force:true});}
});

test('symlink and oversize private state files are rejected without leaking content',()=>{
  const separate=fs.mkdtempSync(path.join(os.tmpdir(),'fg-unsafe-recovery-file-'));
  try{
    fs.writeFileSync(path.join(separate,'sensitive.json'),
      JSON.stringify(state({privateToken:'not-for-display'})));
    fs.symlinkSync(path.join(separate,'sensitive.json'),path.join(separate,'state.json'));
    const link=run(separate);
    assert.equal(link.status,3);
    assert.equal(resultOf(link).status,'INSPECTION_FAILED');
    fs.unlinkSync(path.join(separate,'state.json'));
    fs.writeFileSync(path.join(separate,'state.json'),'SYNTHETIC-SECRET-'.repeat(9000));
    const huge=run(separate);
    assert.equal(huge.status,3);
    assert.equal(resultOf(huge).status,'INSPECTION_FAILED');
    assert.doesNotMatch(huge.stdout,/SYNTHETIC-SECRET/);
  }finally{fs.rmSync(separate,{recursive:true,force:true});}
});
