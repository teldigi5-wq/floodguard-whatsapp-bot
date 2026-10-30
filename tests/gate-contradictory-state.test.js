'use strict';
// Synthetic-only gate state consistency regression: no Firebase/WhatsApp,
// real recipients, servo commands, live operations or network traffic.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-gate-contradiction-'));
process.env.DATA_PATH=dir;
const {subscribe,saveState,getState}=require('../src/store');
const {normalizeGate,consistentGatePosition,processLiveChange}=require('../src/floodguard');
const JID='synthetic-gate-boundary@s.whatsapp.net';
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

function gate(status,angle,countdownSeconds=0){
  return {gate:{status,angle,countdownSeconds}};
}
function observation(status,angle,sourceAt,distanceCm=13,countdownSeconds=0){
  return {
    ...gate(status,angle,countdownSeconds),
    water:{distanceCm,status:'UNKNOWN'},
    system:{lastUpdate:sourceAt,overallRisk:'HIGH'},
    alarm:{active:false}
  };
}
function setup(state={}){
  subscribe(JID);
  saveState({
    initialized:false,level:'UNKNOWN',gateStatus:'UNKNOWN',
    procedureId:null,sentCountdown:[],lastEventKey:'',
    lastSourceAt:0,deliveryUncertain:false,deliveryDegraded:false,
    ...state
  });
  const messages=[];
  const sock={sendMessage:async(jid,body)=>{
    assert.equal(jid,JID);
    messages.push(body.text);
  }};
  return {sock,messages};
}

test('contradictory controller status and angle are UNKNOWN, never CLOSED',()=>{
  for(const sample of [
    gate('OPEN',0),gate('OPEN',10),gate('CLOSED',45),
    gate('CLOSED',90),gate('CLOSED',null),gate('OPEN',null),
    gate('OPEN','bad'),gate('CLOSED',-1),gate('OPEN',91),
    gate('OPEN',90,5),gate('CLOSED',0,5),
    gate('UNKNOWN',0),gate(null,90),
    gate('OPEN',42.5),gate('CLOSED',0,11)
  ]){
    assert.equal(normalizeGate(sample),'UNKNOWN',JSON.stringify(sample));
    assert.equal(consistentGatePosition(sample,'CLOSED'),false);
    assert.equal(consistentGatePosition(sample,'OPEN'),false);
  }
});

test('only matching bounded controller status plus angle forms a consistent report',()=>{
  assert.equal(normalizeGate(gate('OPEN',90)),'OPEN');
  assert.equal(normalizeGate(gate('OPEN',80)),'OPEN');
  assert.equal(normalizeGate(gate('CLOSED',0)),'CLOSED');
  assert.equal(normalizeGate(gate('CLOSED',10)),'CLOSED');
  assert.equal(consistentGatePosition(gate('OPEN',80),'OPEN'),true);
  assert.equal(consistentGatePosition(gate('CLOSED',10),'CLOSED'),true);
  assert.equal(consistentGatePosition(gate('OPEN',80),'CLOSED'),false);
  assert.equal(normalizeGate(gate('OPENING_WARNING',null,5)),'COUNTDOWN');
  assert.equal(normalizeGate(gate('OPENING_WARNING',null,0)),'UNKNOWN');
});

test('contradictory near-zero angle cannot falsely announce gate CLOSED',async()=>{
  const {sock,messages}=setup();
  const now=Date.now();
  await processLiveChange(sock,observation('CLOSED',0,now-5000,21));
  await processLiveChange(sock,observation('OPEN',90,now-4000));
  assert.equal(getState().gateStatus,'OPEN');
  const before=messages.length;
  // Controller continues to report OPEN while an older angle patch says 0.
  await processLiveChange(sock,observation('OPEN',0,now-3000));
  assert.equal(getState().gateStatus,'UNKNOWN');
  assert.equal(messages.length,before);
  assert.equal(messages.some(m=>m.includes('*DAM GATE CLOSED*')),false);
  await processLiveChange(sock,observation('CLOSED',90,now-2000));
  assert.equal(getState().gateStatus,'UNKNOWN');
  assert.equal(messages.some(m=>m.includes('*DAM GATE CLOSED*')),false);
});

test('matching newer CLOSED controller report allows a qualified gate notification',async()=>{
  const {sock,messages}=setup();
  const now=Date.now();
  await processLiveChange(sock,observation('CLOSED',0,now-5000,21));
  await processLiveChange(sock,observation('OPEN',90,now-4000));
  await processLiveChange(sock,observation('CLOSED',0,now-3000));
  assert.equal(getState().gateStatus,'CLOSED');
  const closing=messages.filter(m=>m.includes('*DAM GATE CLOSED*'));
  assert.equal(closing.length,1);
  assert.match(closing[0],/Physical closure is not independently verified/);
});

test('contradictory CLOSED cannot cancel an ongoing countdown',async()=>{
  const {sock,messages}=setup();
  const now=Date.now();
  await processLiveChange(sock,observation('CLOSED',0,now-5000,21));
  await processLiveChange(sock,observation('OPENING_WARNING',0,now-4000,13,5));
  assert.ok(getState().procedureId);
  const prior=getState().procedureId;
  await processLiveChange(sock,observation('CLOSED',90,now-3000,21));
  assert.equal(getState().gateStatus,'UNKNOWN');
  assert.equal(getState().procedureId,prior);
  assert.equal(messages.filter(m=>m.includes('*GATE OPENING CANCELLED*')).length,0);
  await processLiveChange(sock,observation('CLOSED',0,now-2000,21));
  assert.equal(getState().procedureId,null);
  assert.equal(messages.filter(m=>m.includes('*GATE OPENING CANCELLED*')).length,1);
});
