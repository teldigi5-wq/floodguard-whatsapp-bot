'use strict';
// All recipients and WhatsApp transports are synthetic. No live services.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-active-send-timeout-'));
process.env.DATA_PATH=dir;
const {subscribe,saveState,getState}=require('../src/store');
const {processLiveChange}=require('../src/floodguard');
const JIDS=['synthetic-hung@s.whatsapp.net','synthetic-next@s.whatsapp.net'];
for(const jid of JIDS) subscribe(jid);
test.after(()=>{
  delete process.env.FLOODGUARD_SEND_TIMEOUT_MS;
  fs.rmSync(dir,{recursive:true,force:true});
});
function reading(distanceCm,at){
  return {water:{distanceCm,status:'UNKNOWN'},
    gate:{status:'CLOSED',angle:0,countdownSeconds:0},
    alarm:{active:false},
    system:{lastUpdate:at,overallRisk:'LOW'}};
}
function reset(){
  saveState({initialized:false,level:'UNKNOWN',gateStatus:'UNKNOWN',
    procedureId:null,sentCountdown:[],lastEventKey:'',deliveryDegraded:false,
    deliveryUncertain:false,alertSendFailureCount:0});
  process.env.FLOODGUARD_SEND_TIMEOUT_MS='40';
}
async function baseline(sock,base){await processLiveChange(sock,reading(21,base));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=async(promise,ms=600)=>{
  let timer;
  try{
    return await Promise.race([promise,new Promise((_,reject)=>
      {timer=setTimeout(()=>reject(Error('TEST: active alert path hung')),ms);})]);
  }finally{clearTimeout(timer);}
};

test('a hung synthetic DANGER send times out, quarantines delivery and skips remaining recipients',async()=>{
  reset();
  const now=Date.now();
  const calls=[];
  const sock={sendMessage:async(jid,message)=>{
    calls.push({jid,text:message.text});
    return new Promise(()=>{});
  }};
  await baseline(sock,now-3000);
  await assert.rejects(bounded(processLiveChange(sock,reading(13,now-2000))),
    /delivery.*uncertain.*manual/i);
  assert.deepEqual(calls.map(c=>c.jid),[JIDS[0]],'do not send another copy after ambiguous outcome');
  const s=getState();
  assert.equal(s.level,'DANGER','record observed danger, never invent delivery success');
  assert.equal(s.deliveryUncertain,true,'persist a sticky uncertainty alert for operators');
  assert.equal(s.deliveryDegraded,true);
  assert.equal(s.alertSendFailureCount,1);
  assert.ok(Number.isSafeInteger(s.lastDeliveryFailureAt));
  assert.equal(s.lastSourceAt,now-2000);
  assert.equal(s.lastObservedLevel,'DANGER');
  await bounded(processLiveChange(sock,reading(21,now-1000)));
  assert.equal(calls.length,1,'new SAFE must not bypass unresolved DANGER delivery');
  assert.equal(getState().deliveryUncertain,true);
  assert.equal(getState().lastObservedLevel,'SAFE','continue recording sensor observations');
});

test('late success does not clear quarantine or replay the timed-out alert',async()=>{
  reset();
  const now=Date.now();
  let release;
  let calls=0;
  const sock={sendMessage:async()=>{
    calls++;
    await new Promise(resolve=>{release=resolve;});
  }};
  await baseline(sock,now-3000);
  await assert.rejects(bounded(processLiveChange(sock,reading(13,now-2000))),
    /delivery.*uncertain.*manual/i);
  release();
  await sleep(25);
  await bounded(processLiveChange(sock,reading(13,now-1000)));
  assert.equal(calls,1);
  assert.equal(getState().deliveryUncertain,true);
  assert.equal(getState().alertSendFailureCount,1);
});

test('an ordinary rejected fake send remains counted but later subscribers may be attempted',async()=>{
  reset();
  const now=Date.now();
  const log=console.error;
  const messages=[];
  console.error=()=>{};
  try{
    const sock={sendMessage:async(jid)=>{
      messages.push(jid);
      if(jid===JIDS[0])throw Error('synthetic secret auth=do-not-log');
    }};
    await baseline(sock,now-3000);
    await bounded(processLiveChange(sock,reading(13,now-2000)));
    assert.deepEqual(messages,JIDS);
    assert.equal(getState().deliveryUncertain,false);
    assert.equal(getState().deliveryDegraded,true);
    assert.equal(getState().alertSendFailureCount,1);
  }finally{console.error=log;}
});

test('successful synthetic send clears timers and keeps normal future transitions possible',async()=>{
  reset();
  const now=Date.now();
  const messages=[];
  const sock={sendMessage:async(jid,msg)=>{messages.push({jid,text:msg.text});await sleep(3);}};
  await baseline(sock,now-3000);
  await bounded(processLiveChange(sock,reading(13,now-2000)));
  await bounded(processLiveChange(sock,reading(21,now-1000)));
  assert.equal(messages.length,4);
  assert.equal(messages.filter(m=>m.text.includes('FLOODGUARD DANGER')).length,2);
  assert.equal(messages.filter(m=>m.text.includes('FLOODGUARD RECOVERY')).length,2);
  assert.equal(getState().deliveryUncertain,false);
  assert.equal(getState().level,'SAFE');
});

test('invalid configured timeouts fail closed before a private send begins',async()=>{
  const now=Date.now();
  for(const raw of ['0','-3','999999','3.5','bad']){
    reset();
    process.env.FLOODGUARD_SEND_TIMEOUT_MS=raw;
    const calls=[];
    const sock={sendMessage:async(jid)=>{calls.push(jid);}};
    await baseline(sock,now-3000);
    await assert.rejects(bounded(processLiveChange(sock,reading(13,now-2000))),
      /invalid.*send timeout/i);
    assert.deepEqual(calls,[],'invalid policy must not start any alert send');
  }
});
