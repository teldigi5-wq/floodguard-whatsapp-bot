'use strict';
// OFFLINE synthetic ingress tests. No Firebase, WhatsApp, hardware or accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createVirtualTelemetryScheduler } = require('../src/virtualTelemetryScheduler');

const observation = (phase, sourceAt, topic='water') => ({topic,phase,sourceAt});
const deferred = () => {
  let release;
  const promise = new Promise(resolve => {release = resolve;});
  return {release,promise};
};
function harness() {
  let clock=Date.now();
  const now=()=>clock;
  const advance=ms=>{clock+=ms;};
  return {now,advance};
}

test('bursts of repeated DANGER readings coalesce without hiding a state transition', async()=>{
  const h=harness(), seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,capacity:4,consumer:async o=>seen.push(o)});
  const start=h.now()-2000;
  assert.equal(q.offer(observation('SAFE',start)).kind,'queued');
  assert.equal(q.offer(observation('WARNING',start+200)).kind,'queued');
  assert.equal(q.offer(observation('DANGER',start+400)).kind,'queued');
  for(let i=1;i<=200;i++){
    assert.equal(q.offer(observation('DANGER',start+400+i)).kind,'coalesced');
    assert.ok(q.status().pending<=3);
  }
  const result=await q.drain();
  assert.deepEqual(seen.map(x=>x.phase),['SAFE','WARNING','DANGER']);
  assert.equal(seen[2].sourceAt,start+600);
  assert.equal(result.processed,3);
  assert.equal(q.status().coalesced,200);
  assert.equal(q.status().faulted,false);
});

test('slow fake consumer does not silently discard intervening transitions',async()=>{
  const h=harness(), gate=deferred(),entered=deferred(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,capacity:4,consumer:async o=>{
    seen.push(o.phase);
    if(seen.length===1){entered.release();await gate.promise;}
  }});
  const base=h.now()-5000;
  q.offer(observation('SAFE',base));
  const running=q.drain();
  await entered.promise;
  q.offer(observation('WARNING',base+200));
  q.offer(observation('DANGER',base+400));
  q.offer(observation('SAFE',base+600));
  assert.equal(q.status().pending,3);
  gate.release();
  await running;
  assert.deepEqual(seen,['SAFE','WARNING','DANGER','SAFE']);
  assert.equal(q.status().processed,4);
});

test('overflow under alternating states hard-fails instead of quietly dropping hazard transitions',async()=>{
  const h=harness(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,capacity:3,consumer:async o=>seen.push(o)});
  const base=h.now()-1000;
  for(let i=0;i<3;i++)q.offer(observation(i%2?'WARNING':'DANGER',base+i));
  assert.equal(q.status().pending,3);
  assert.throws(()=>q.offer(observation('SAFE',base+3)),/OVERFLOW/);
  assert.equal(q.status().pending,3);
  assert.equal(q.status().rejectedOverflow,1);
  assert.equal(q.status().faulted,true);
  await assert.rejects(q.drain(),/OVERFLOW/);
  assert.deepEqual(seen,[]);
  assert.throws(()=>q.offer(observation('DANGER',base+4)),/OVERFLOW/);
});

test('duplicate, older and contradictory timestamps cannot create fake recoveries',async()=>{
  const h=harness(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,consumer:async o=>seen.push(o)});
  const ts=h.now()-2000;
  assert.equal(q.offer(observation('DANGER',ts)).kind,'queued');
  assert.equal(q.offer(observation('DANGER',ts)).kind,'duplicate');
  assert.equal(q.offer(observation('SAFE',ts-20)).kind,'older');
  assert.throws(()=>q.offer(observation('SAFE',ts)),/CONFLICT/);
  assert.equal(q.status().faulted,true);
  await assert.rejects(q.drain(),/CONFLICT/);
  assert.deepEqual(seen,[]);
});

test('a stale pending DANGER observation never dispatches after downstream slowness',async()=>{
  const h=harness(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,consumer:async o=>seen.push(o.phase)});
  const old=h.now()-14500;
  q.offer(observation('DANGER',old));
  h.advance(900);
  await assert.rejects(q.drain(),/EXPIRED/);
  assert.equal(q.status().expired,1);
  assert.equal(q.status().faulted,true);
  assert.deepEqual(seen,[]);
});

test('an unknown outcome from fake processing quarantines the batch without retry',async()=>{
  const h=harness(),called=[];
  const q=createVirtualTelemetryScheduler({now:h.now,consumer:async o=>{
    called.push(o.phase);
    throw Error('private token https://example.invalid/?auth=fake-secret');
  }});
  const base=h.now()-3000;
  q.offer(observation('DANGER',base));
  q.offer(observation('SAFE',base+200));
  await assert.rejects(q.drain(),/CONSUMER_FAILURE/);
  assert.deepEqual(called,['DANGER']);
  assert.equal(q.status().quarantined,1);
  assert.equal(q.status().pending,1);
  await assert.rejects(q.drain(),/CONSUMER_FAILURE/);
  assert.deepEqual(called,['DANGER']);
  assert.doesNotMatch(JSON.stringify(q.status()),/fake-secret|example.invalid/);
});

test('concurrent drains are refused without concurrent fake message processing',async()=>{
  const h=harness(),gate=deferred(),entered=deferred(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,consumer:async o=>{
    seen.push(o.phase);
    entered.release();
    await gate.promise;
  }});
  q.offer(observation('WARNING',h.now()-1000));
  const running=q.drain();
  await entered.promise;
  await assert.rejects(q.drain(),/BUSY/);
  gate.release();
  await running;
  assert.deepEqual(seen,['WARNING']);
});

test('invalid telemetry, future times and input mutation are rejected or isolated',async()=>{
  const h=harness(),seen=[];
  const q=createVirtualTelemetryScheduler({now:h.now,consumer:async o=>seen.push(o)});
  const ts=h.now()-1000;
  for(const invalid of [
    {topic:'water',phase:'SAFE',sourceAt:null},
    observation('SAFE',h.now()+60000),
    observation('SAFE',h.now()-100000),
    observation('BAD',ts),
    observation('OPEN',ts,'water'),
    {topic:'water',phase:'DANGER',sourceAt:ts,recipient:'secret'},
    null, [], {}
  ]) assert.throws(()=>q.offer(invalid),/INVALID/);
  const obj=observation('DANGER',ts);
  assert.equal(q.offer(obj).kind,'queued');
  obj.phase='SAFE';obj.sourceAt=ts+500;
  await q.drain();
  assert.equal(seen[0].phase,'DANGER');
  assert.equal(seen[0].sourceAt,ts);
});

test('real bot is not connected to the synthetic queue and queue has no remote import',()=>{
  const bot=fs.readFileSync(path.join(__dirname,'../bot.js'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'../src/virtualTelemetryScheduler.js'),'utf8');
  assert.doesNotMatch(bot,/virtualTelemetryScheduler|createVirtualTelemetryScheduler/);
  assert.doesNotMatch(source,/(@whiskeysockets|firebase|fetch\s*\(|sendMessage\s*\()/i);
});
