'use strict';
// Synthetic field-clock ordering tests. No WhatsApp, RTDB, EC2 or hardware.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-field-clock-'));
process.env.DATA_PATH=dir;
const {saveState,getState,subscribe}=require('../src/store');
const {processLiveChange}=require('../src/floodguard');
const recipient='synthetic-clock-guard@s.whatsapp.net';
subscribe(recipient);
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

function reading(distanceCm,sourceAt,gate='CLOSED'){
  return {
    water:{distanceCm,status:'UNKNOWN'},
    gate:{status:gate,angle:gate==='OPEN'?90:0,countdownSeconds:0},
    alarm:{active:false},
    system:{lastUpdate:sourceAt,overallRisk:'LOW'}
  };
}
function socket(){
  const messages=[];
  return {
    messages,
    client:{sendMessage:async(jid,body)=>{
      assert.equal(jid,recipient);
      messages.push(body.text);
    }}
  };
}
function reset(){
  saveState({initialized:false,level:'UNKNOWN',gateStatus:'UNKNOWN',
    procedureId:null,sentCountdown:[],lastEventKey:''});
}

test('same field timestamp cannot declare recovery from confirmed DANGER',async()=>{
  reset();
  const {messages,client}=socket();
  const now=Date.now();
  const baseline=now-4000, dangerAt=now-2000;
  await processLiveChange(client,reading(21,baseline));
  await processLiveChange(client,reading(13,dangerAt));
  assert.equal(getState().level,'DANGER');
  assert.equal(getState().lastSourceAt,dangerAt);
  const before=messages.length;
  await processLiveChange(client,reading(21,dangerAt));
  assert.equal(messages.length,before,'no unverified SAFE notification');
  assert.equal(getState().level,'DANGER','do not clear last confirmed hazard');
  assert.equal(getState().lastSourceAt,dangerAt);
  await processLiveChange(client,reading(21,now-1000));
  assert.equal(getState().level,'SAFE','a newer physical observation permits recovery');
  assert.equal(messages.filter(m=>m.includes('FLOODGUARD RECOVERY')).length,1);
});

test('same field timestamp cannot downgrade DANGER to WARNING',async()=>{
  reset();
  const {messages,client}=socket();
  const now=Date.now();
  const baseline=now-5000, hazardAt=now-2000;
  await processLiveChange(client,reading(21,baseline));
  await processLiveChange(client,reading(13,hazardAt));
  const before=messages.length;
  await processLiveChange(client,reading(16,hazardAt));
  assert.equal(messages.length,before);
  assert.equal(getState().level,'DANGER');
  assert.equal(getState().lastSourceAt,hazardAt);
});

test('same-clock escalation to DANGER must still be allowed',async()=>{
  reset();
  const {messages,client}=socket();
  const now=Date.now(), clock=now-2000;
  await processLiveChange(client,reading(21,now-4000));
  await processLiveChange(client,reading(21,clock));
  assert.equal(getState().lastSourceAt,clock);
  await processLiveChange(client,reading(13,clock));
  assert.equal(getState().level,'DANGER');
  assert.equal(messages.filter(m=>m.includes('FLOODGUARD DANGER')).length,1);
});

test('gate updates at same source time remain eligible when water hazard is unchanged',async()=>{
  reset();
  const {messages,client}=socket();
  const now=Date.now(), hazardAt=now-2000;
  await processLiveChange(client,reading(21,now-4000));
  await processLiveChange(client,reading(13,hazardAt));
  await processLiveChange(client,reading(13,hazardAt,'OPEN'));
  assert.equal(getState().level,'DANGER');
  assert.equal(getState().gateStatus,'OPEN');
  assert.equal(messages.filter(m=>m.includes('FLOODGUARD DAM GATE OPEN')).length,1);
});
