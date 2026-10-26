'use strict';
// Synthetic-only integration-contract tests. No live Firebase, WhatsApp,
// production bot entrypoint, or physical FloodGuard hardware.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {planVirtualWaterSnapshot}=require('../src/virtualAlertPlanner');
const {createVirtualOutbox}=require('../src/virtualOutbox');

const TARGET='fake-planner@s.whatsapp.net';
function live(distanceCm,lastUpdate,reported='UNKNOWN'){
  return {water:{distanceCm,status:reported},system:{lastUpdate}};
}
function plan(input,previous=null,now=Date.now()){
  return planVirtualWaterSnapshot({live:input,previous,now});
}

test('first validated reading initializes observation but creates no invented alert',()=>{
  const now=Date.now(),out=plan(live(21,now-1000),null,now);
  assert.equal(out.accepted,true);
  assert.deepEqual(out.observation,{topic:'water',phase:'SAFE',sourceAt:now-1000});
  assert.equal(out.alert,null);
});

test('threshold transitions produce deterministic, explicitly synthetic events',()=>{
  const now=Date.now();
  const first=plan(live(21,now-3000),null,now);
  const warning=plan(live(16,now-2000),first.observation,now);
  assert.equal(warning.observation.phase,'WARNING');
  assert.equal(warning.alert.phase,'WARNING');
  assert.match(warning.alert.text,/SYNTHETIC|VIRTUAL|DEMO/);
  const danger=plan(live(13,now-1000,'SAFE'),warning.observation,now);
  assert.equal(danger.observation.phase,'DANGER','trusted physical distance outranks stale backend SAFE');
  assert.equal(danger.alert.phase,'DANGER');
  const again=plan(live(13,now-500),danger.observation,now);
  assert.equal(again.accepted,true);
  assert.equal(again.alert,null,'repeated DANGER should not emit another entry alert');
  assert.deepEqual(
    plan(live(13,now-1000,'SAFE'),warning.observation,now).alert,
    danger.alert,
    'identical input and source clock produce identical dedupe keys');
});

test('invalid and stale physical readings never create a SAFE recovery',()=>{
  const now=Date.now();
  const previous={topic:'water',phase:'DANGER',sourceAt:now-3000};
  for(const value of [null,'', ' ',0,-1,401,'NaN',false,{},[],Infinity]){
    const out=plan(live(value,now-1000,'SAFE'),previous,now);
    assert.equal(out.accepted,false,String(value));
    assert.equal(out.observation,null);
    assert.equal(out.alert,null);
  }
  for(const ts of [null,0,now-120000,now+100000,'2026-01-01']){
    const out=plan(live(21,ts,'SAFE'),previous,now);
    assert.equal(out.accepted,false,String(ts));
    assert.equal(out.alert,null);
  }
});

test('older source clock and equal-source contradictions are rejected',()=>{
  const now=Date.now(),previous={topic:'water',phase:'DANGER',sourceAt:now-1500};
  for(const ts of [now-2200,now-1500]){
    const out=plan(live(21,ts,'SAFE'),previous,now);
    assert.equal(out.accepted,false);
    assert.equal(out.alert,null);
  }
  assert.equal(plan(live(21,now-1000),{sourceAt:now-1500,phase:'BAD'},now).accepted,false);
});

test('verified newer SAFE revokes a queued DANGER before the virtual outbox can send',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-planner-outbox-'));
  const now=Date.now();
  const outbox=createVirtualOutbox({dataDir:dir,now:()=>now,exclusive:true});
  try{
    const safe=plan(live(21,now-3000),null,now);
    assert.equal(outbox.observe(safe.observation),true);
    const danger=plan(live(13,now-2000),safe.observation,now);
    assert.equal(outbox.observe(danger.observation),true);
    assert.equal(outbox.enqueue({...danger.alert,recipients:[TARGET]}),true);
    const cleared=plan(live(21,now-1000),danger.observation,now);
    assert.equal(cleared.observation.phase,'SAFE');
    assert.equal(cleared.alert.phase,'SAFE');
    outbox.observe(cleared.observation);
    const sent=[];
    const drained=await outbox.drain({observation:cleared.observation,
      authorizedRecipients:new Set([TARGET]),send:async (...args)=>sent.push(args)});
    assert.equal(drained.attempted,0);
    assert.equal(outbox.summary().superseded,1);
    assert.deepEqual(sent,[]);
  }finally{
    outbox.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('synthetic planner never opens network connections or imports account services',()=>{
  const bot=fs.readFileSync(path.join(__dirname,'../bot.js'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'../src/virtualAlertPlanner.js'),'utf8');
  assert.doesNotMatch(bot,/virtualAlertPlanner|planVirtualWaterSnapshot/);
  assert.doesNotMatch(source, /require\(['"](?:@whiskeysockets|axios|firebase|http|https)/);
  assert.doesNotMatch(source, /fetch\(|sendMessage\(|createVirtualOutbox\(/);
});
