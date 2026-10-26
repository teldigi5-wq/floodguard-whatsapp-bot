'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVirtualOutbox } = require('../src/virtualOutbox');

const A = 'synthetic-a@s.whatsapp.net';
const B = 'synthetic-b@s.whatsapp.net';
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-outbox-virtual-'));
  let clock = Date.now();
  const now = () => clock;
  const advance = ms => { clock += ms; };
  const subject = createVirtualOutbox({ dataDir: dir, now });
  return Promise.resolve().then(() => fn({ subject, dir, now, advance })).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
const observation = (now, phase = 'DANGER', topic = 'water') =>
  ({ topic, phase, sourceAt: now() - 1000 });
const message = (o, overrides={}) => ({
  key:'synthetic-water-transition-1', topic:o.topic, sourceAt:o.sourceAt,
  phase:o.phase, recipients:[A,B], text:'FICTIONAL flood warning', ...overrides
});

test('one fake delivery failure is retained, retried on a fresh verification, then cleared', () => fixture(async({subject,now,advance}) => {
  const obs = observation(now);
  assert.equal(subject.observe(obs),true);
  assert.equal(subject.enqueue(message(obs)),true);
  let calls = 0;
  const attempted = await subject.drain({observation:obs,authorizedRecipients:new Set([A,B]),
    send:async jid => {calls++; if(jid===B)throw Error('private URL with token');}});
  assert.deepEqual({attempted:attempted.attempted,accepted:attempted.accepted,failed:attempted.failed},
    {attempted:2,accepted:1,failed:1});
  assert.equal(subject.summary().pending,1);
  advance(1100);
  subject.observe(obs);
  const result = await subject.drain({observation:obs,authorizedRecipients:new Set([A,B]),
    send:async() => { calls++; }});
  assert.equal(result.accepted,1);
  assert.equal(result.pending,0);
  assert.equal(calls,3);
  assert.equal(subject.summary().failedAttempts,1);
}));

test('restart never automatically drains without explicit current observation', () => fixture(async({subject,dir,now,advance}) => {
  const obs = observation(now);
  subject.observe(obs);
  subject.enqueue(message(obs,{recipients:[A]}));
  const reopened = createVirtualOutbox({dataDir:dir,now});
  const send = async() => {throw Error('should not send');};
  await assert.rejects(reopened.drain({observation:obs,authorizedRecipients:new Set([A]),send}),
    /newly verified/);
  advance(50);
  reopened.observe(obs);
  const result = await reopened.drain({observation:obs,authorizedRecipients:new Set([A]),send:async()=>{}});
  assert.equal(result.accepted,1);
}));

test('newer SAFE supersedes a pending DANGER; obsolete danger is never resent', () => fixture(async({subject,now,advance}) => {
  const danger = observation(now);
  subject.observe(danger);
  subject.enqueue(message(danger,{recipients:[A]}));
  advance(1500);
  const safe = observation(now,'SAFE');
  subject.observe(safe);
  let sends=0;
  const res=await subject.drain({observation:safe,authorizedRecipients:new Set([A]),
    send:async()=>{sends++}});
  assert.equal(res.attempted,0);
  assert.equal(sends,0);
  assert.equal(subject.summary().pending,0);
  assert.equal(subject.summary().superseded,1);
}));

test('duplicate event key cannot enqueue a second batch after completion', () => fixture(async({subject,now}) => {
  const obs=observation(now);
  subject.observe(obs);
  assert.equal(subject.enqueue(message(obs,{recipients:[A]})),true);
  const accepted=await subject.drain({observation:obs,authorizedRecipients:new Set([A]),send:async()=>{}});
  assert.equal(accepted.accepted,1);
  assert.equal(subject.enqueue(message(obs,{recipients:[A]})),false);
  assert.equal(subject.summary().pending,0);
}));

test('unsubscribed recipients are removed without a send attempt', () => fixture(async({subject,now}) => {
  const obs=observation(now);
  subject.observe(obs);
  subject.enqueue(message(obs));
  let sends=[];
  const res=await subject.drain({observation:obs,authorizedRecipients:new Set([A]),send:async jid=>sends.push(jid)});
  assert.deepEqual(sends,[A]);
  assert.equal(res.removed,1);
  assert.equal(subject.summary().pending,0);
}));

test('retry attempts are bounded and exhaustion is explicitly counted', () => fixture(async({subject,now,advance}) => {
  const obs=observation(now);
  subject.observe(obs);
  subject.enqueue(message(obs,{recipients:[A]}));
  for(const delta of [0,1100,2100]) {
    advance(delta);
    subject.observe(obs);
    const res=await subject.drain({observation:obs,authorizedRecipients:new Set([A]),
      send:async()=>{throw Error('synthetic failure with private details')}});
    assert.equal(res.failed,1);
  }
  assert.equal(subject.summary().failedAttempts,3);
  assert.equal(subject.summary().exhausted,1);
  assert.equal(subject.summary().pending,0);
}));

test('reject late or contradictory events, future clocks and unsafe recipient formats', () => fixture(async({subject,now}) => {
  const obs=observation(now);
  subject.observe(obs);
  assert.equal(subject.observe({...obs,sourceAt:obs.sourceAt-200}),false);
  assert.throws(()=>subject.observe({...obs,phase:'SAFE'}),/conflicting/);
  assert.throws(()=>subject.observe({...obs,sourceAt:now()+100000}),/recent/);
  assert.throws(()=>subject.enqueue(message(obs,{recipients:['public@example.com']})),/recipient/);
  assert.throws(()=>subject.enqueue(message(obs,{ttlMs:30000})),/TTL/);
}));

test('bounded backlog rejects capacity overflow without deleting existing jobs', () => fixture(async({subject,now}) => {
  const obs=observation(now);
  subject.observe(obs);
  const recipients=Array.from({length:32},(_,i)=>'fake-'+i+'@s.whatsapp.net');
  for(let i=0;i<4;i++) assert.equal(subject.enqueue(message(obs,{key:'fake-'+i,recipients})),true);
  assert.equal(subject.summary().pending,128);
  assert.throws(()=>subject.enqueue(message(obs,{key:'overflow',recipients:[A]})),/capacity/);
  assert.equal(subject.summary().pending,128);
}));

test('corrupt persisted file is not silently replaced by an empty queue', () => fixture(async({dir,now}) => {
  fs.writeFileSync(path.join(dir,'alert-outbox-v1.json'), '{broken');
  assert.throws(()=>createVirtualOutbox({dataDir:dir,now}),/corrupt private file/);
  assert.equal(fs.readFileSync(path.join(dir,'alert-outbox-v1.json'),'utf8'),'{broken');
}));

test('sends cannot run twice concurrently against the same process-local outbox', () => fixture(async({subject,now}) => {
  const obs=observation(now);
  subject.observe(obs);
  subject.enqueue(message(obs,{recipients:[A]}));
  let release;
  const pending=subject.drain({observation:obs,authorizedRecipients:new Set([A]),
    send:async()=>new Promise(resolve=>{release=resolve})});
  // Let the first drain reach the synthetic send callback.
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(subject.drain({observation:obs,authorizedRecipients:new Set([A]),send:async()=>{}}),/concurrent/);
  release();
  await pending;
}));


test('outbox remains disconnected from the production WhatsApp and Firebase entrypoints', () => {
  const bot = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
  const logic = fs.readFileSync(path.join(__dirname, '../src/floodguard.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../src/virtualOutbox.js'), 'utf8');
  assert.doesNotMatch(bot, /virtualOutbox|createVirtualOutbox/);
  assert.doesNotMatch(logic, /virtualOutbox|createVirtualOutbox/);
  assert.doesNotMatch(source, /@whiskeysockets|firebase|fetch\(|start\(\)/i);
});
