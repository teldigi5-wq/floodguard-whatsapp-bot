'use strict';
// Local-only fake-consumer liveness tests; never connects to WhatsApp or RTDB.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createVirtualTelemetryScheduler}=require('../src/virtualTelemetryScheduler');

const observation=(phase,at)=>({topic:'water',phase,sourceAt:at});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function deferred() {
  let release;
  const promise=new Promise(resolve=>{release=resolve;});
  return {promise,release};
}
async function failFast(promise,ms=350) {
  let timer;
  try{
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('TEST_WATCHDOG: consumer never settled')),ms);
    })]);
  }finally{clearTimeout(timer);}
}

test('never-settling synthetic consumer is quarantined within configured deadline',async()=>{
  let calls=0,signal;
  const q=createVirtualTelemetryScheduler({consumerTimeoutMs:35,consumer:(_item,options)=>{
    calls++;
    signal=options.signal;
    return new Promise(()=>{});
  }});
  const base=Date.now()-1000;
  q.offer(observation('DANGER',base));
  q.offer(observation('SAFE',base+50));
  await assert.rejects(failFast(q.drain()),/CONSUMER_TIMEOUT/);
  assert.equal(calls,1,'queued SAFE must never dispatch after timed-out DANGER');
  assert.equal(signal?.aborted,true,'best-effort cancellation signal is required');
  assert.deepEqual(
    {faulted:q.status().faulted,faultCode:q.status().faultCode,
      quarantined:q.status().quarantined,timedOut:q.status().timedOut,
      processed:q.status().processed,pending:q.status().pending,inFlight:q.status().inFlight},
    {faulted:true,faultCode:'CONSUMER_TIMEOUT',quarantined:1,timedOut:1,
      processed:0,pending:1,inFlight:false});
  await assert.rejects(q.drain(),/CONSUMER_TIMEOUT/);
  assert.throws(()=>q.offer(observation('DANGER',base+100)),/CONSUMER_TIMEOUT/);
  assert.equal(calls,1);
});

test('late resolution cannot clear the failure state or continue a queued recovery',async()=>{
  const gate=deferred(),entered=deferred(),calls=[];
  const q=createVirtualTelemetryScheduler({consumerTimeoutMs:40,consumer:async(entry,{signal})=>{
    calls.push(entry.phase);
    entered.release();
    await gate.promise;
    assert.equal(signal.aborted,true,'late completion remains explicitly uncertain');
  }});
  const base=Date.now()-1000;
  q.offer(observation('DANGER',base));
  q.offer(observation('SAFE',base+100));
  const running=q.drain();
  await entered.promise;
  await assert.rejects(failFast(running),/CONSUMER_TIMEOUT/);
  gate.release();
  await pause(30);
  assert.deepEqual(calls,['DANGER']);
  assert.equal(q.status().processed,0);
  assert.equal(q.status().pending,1);
  assert.equal(q.status().faultCode,'CONSUMER_TIMEOUT');
  await assert.rejects(q.drain(),/CONSUMER_TIMEOUT/);
});

test('a successful fake consumer clears its timeout without a false quarantine',async()=>{
  const calls=[];
  const q=createVirtualTelemetryScheduler({consumerTimeoutMs:150,consumer:async(o,{signal})=>{
    calls.push(o.phase);
    assert.equal(signal.aborted,false);
    await pause(8);
    assert.equal(signal.aborted,false);
  }});
  const base=Date.now()-1000;
  q.offer(observation('SAFE',base));
  q.offer(observation('DANGER',base+50));
  assert.deepEqual(await failFast(q.drain(),500),{processed:2,pending:0});
  assert.deepEqual(calls,['SAFE','DANGER']);
  assert.equal(q.status().faulted,false);
  assert.equal(q.status().quarantined,0);
  assert.equal(q.status().timedOut,0);
  await pause(170);
  assert.equal(q.status().faulted,false,'stale timeout must not fire after success');
});

test('a synchronous fake consumer exception remains redacted and no retry occurs',async()=>{
  const q=createVirtualTelemetryScheduler({consumerTimeoutMs:35,consumer:()=>{
    throw Error('synthetic-SECRET https://private.invalid/?auth=token');
  }});
  q.offer(observation('WARNING',Date.now()-1000));
  await assert.rejects(q.drain(),/CONSUMER_FAILURE/);
  assert.equal(q.status().faultCode,'CONSUMER_FAILURE');
  assert.equal(q.status().quarantined,1);
  assert.equal(q.status().timedOut,0);
  assert.doesNotMatch(JSON.stringify(q.status()),/synthetic-SECRET|private.invalid/);
});

test('invalid consumer timeouts are refused before any processing starts',()=>{
  for(const consumerTimeoutMs of [0,-1,1.2,'100',null,NaN,Infinity,10001]){
    assert.throws(()=>createVirtualTelemetryScheduler({
      consumerTimeoutMs,consumer:async()=>{}
    }),/INVALID/);
  }
});
