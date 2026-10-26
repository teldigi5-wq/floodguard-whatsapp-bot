'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createVirtualOutbox} = require('../src/virtualOutbox');

const A = 'synthetic-a@s.whatsapp.net';
const B = 'synthetic-b@s.whatsapp.net';
const C = 'synthetic-c@s.whatsapp.net';
async function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-outbox-stress-'));
  let t = Date.now();
  const now = () => t;
  const advance = ms => {t += ms;};
  const outbox = createVirtualOutbox({dataDir:dir,now});
  try {await run({outbox,dir,now,advance});}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function obs(t, phase='DANGER') {
  return {topic:'water',phase,sourceAt:t-1000};
}
function job(o, key, recipients=[A,B,C], ttlMs=7000) {
  return {key,topic:o.topic,phase:o.phase,sourceAt:o.sourceAt,
    recipients,text:'FICTIONAL warning',ttlMs};
}

test('expired queued warnings are counted by both drain report and persisted summary',()=>fixture(async({outbox,now,advance})=>{
  const o=obs(now());
  outbox.observe(o);
  outbox.enqueue(job(o,'expired-replay',[A,B],1000));
  advance(1500);
  const messages=[];
  const report=await outbox.drain({observation:o,authorizedRecipients:new Set([A,B]),
    send:async j=>messages.push(j)});
  assert.deepEqual(messages,[]);
  assert.equal(report.expired,2);
  assert.equal(report.pending,0);
  assert.equal(outbox.summary().expired,2);
}));

test('a slow first send does not deliver remaining warnings after their expiry',()=>fixture(async({outbox,now,advance})=>{
  const o=obs(now());
  outbox.observe(o);
  outbox.enqueue(job(o,'slow-send',[A,B,C],1000));
  const sent=[];
  const report=await outbox.drain({observation:o,authorizedRecipients:new Set([A,B,C]),
    send:async j=>{sent.push(j);advance(2000);}});
  assert.deepEqual(sent,[A]);
  assert.equal(report.accepted,1);
  assert.equal(report.expired,2);
  assert.equal(report.pending,0);
  assert.equal(outbox.summary().expired,2);
}));

test('a rapid burst of 180 newer observations supersedes pending alerts without queue growth',()=>fixture(async({outbox,now,advance})=>{
  let accepted=0;
  let previous=null;
  for(let i=0;i<180;i++){
    if(i>0)advance(5);
    const o=obs(now());
    assert.equal(outbox.observe(o),true);
    assert.equal(outbox.enqueue(job(o,'burst-'+i,[A])),true);
    if(previous)assert.equal(outbox.observe(previous),false);
    assert.equal(outbox.summary().pending,1);
    previous=o;
    accepted++;
  }
  assert.equal(accepted,180);
  assert.equal(outbox.summary().superseded,179);
  const sent=[];
  const report=await outbox.drain({observation:previous,authorizedRecipients:new Set([A]),
    send:async j=>sent.push(j)});
  assert.deepEqual(sent,[A]);
  assert.equal(report.accepted,1);
  assert.equal(outbox.summary().pending,0);
}));

test('reopened stores remove expired alerts without needing a real WhatsApp session',()=>fixture(async({outbox,dir,now,advance})=>{
  const o=obs(now());
  outbox.observe(o);
  outbox.enqueue(job(o,'reopen-expiry',[A],1000));
  advance(2000);
  const recovered=createVirtualOutbox({dataDir:dir,now});
  assert.equal(recovered.observe(o),true);
  let calls=0;
  const result=await recovered.drain({observation:o,authorizedRecipients:new Set([A]),
    send:async()=>{calls++}});
  assert.equal(calls,0);
  assert.equal(result.pending,0);
  assert.equal(recovered.summary().expired,1);
}));
