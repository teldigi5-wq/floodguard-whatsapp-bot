'use strict';
// Synthetic local subscriber records only. No real WhatsApp/RTDB calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-subscription-validation-'));
process.env.DATA_PATH=dir;
const store=require('../src/store');
const filename=path.join(dir,'subscribers.json');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const put=values=>fs.writeFileSync(filename,JSON.stringify(values),{mode:0o600});
const get=()=>[...store.getSubscribers()];
const identity=(n,domain='s.whatsapp.net')=>String(n)+'@'+domain;

test('valid synthetic phone, linked-device and group JIDs are preserved',()=>{
  put([]);
  const expected=['synthetic-person@s.whatsapp.net','123456:2@s.whatsapp.net',
    '900000000001@lid','120363012345678@g.us'];
  for(const jid of expected)store.subscribe(jid);
  assert.deepEqual(get(),expected);
  store.subscribe(expected[0]);
  assert.deepEqual(get(),expected,'subscribing a duplicate is idempotent');
  store.unsubscribe(expected[2]);
  assert.deepEqual(get(),expected.filter(x=>x!==expected[2]));
});

test('malformed and unsupported destination JIDs must not be persisted or removed',()=>{
  put([identity(10001)]);
  const initial=fs.readFileSync(filename,'utf8');
  const bad=[null,undefined,0,{},[],true,'',' ','not-a-jid',
    'x@evil.invalid','123@broadcast','@s.whatsapp.net',
    'x y@s.whatsapp.net','x\n@s.whatsapp.net',
    'x\r@s.whatsapp.net','x\u0000@s.whatsapp.net',
    'x\u001b[31m@s.whatsapp.net',
    'x@lid\nADMIN=1',
    'x'.repeat(129)+'@s.whatsapp.net'
  ];
  for(const jid of bad) {
    assert.throws(()=>store.subscribe(jid),/invalid.*subscriber|invalid.*recipient/i,
      'subscribe must reject unsafe synthetic recipient '+String(jid));
    assert.throws(()=>store.unsubscribe(jid),/invalid.*subscriber|invalid.*recipient/i,
      'unsubscribe must reject malformed recipient '+String(jid));
    assert.equal(fs.readFileSync(filename,'utf8'),initial);
  }
});

test('stored malformed recipients are rejected without silently rewriting a private file',()=>{
  for(const value of [['x\n@s.whatsapp.net'],['x@evil.invalid'],[42],
    [identity(1), 'x@broadcast']]) {
    put(value);
    const before=fs.readFileSync(filename,'utf8');
    assert.throws(()=>store.getSubscribers(),/invalid.*subscriber/i);
    assert.equal(fs.readFileSync(filename,'utf8'),before);
  }
});

test('the subscriber limit is enforced on new enrollment and on tampered stored records',()=>{
  const full=Array.from({length:512},(_,i)=>identity(1000000+i));
  put(full);
  assert.equal(store.getSubscribers().size,512);
  const before=fs.readFileSync(filename,'utf8');
  assert.throws(()=>store.subscribe(identity(90000000)),/capacity|subscriber.*limit|too many/i);
  assert.equal(fs.readFileSync(filename,'utf8'),before,'limit must not corrupt subscribers');
  put([...full,identity(90000000)]);
  const excess=fs.readFileSync(filename,'utf8');
  assert.throws(()=>store.getSubscribers(),/capacity|subscriber.*limit|too many/i);
  assert.equal(fs.readFileSync(filename,'utf8'),excess,'do not silently truncate');
});

test('oversized subscriber JSON fails closed without logging its private contents',()=>{
  // Larger than any supported valid subscriber list; avoid unbounded JSON parsing.
  const oversized='["'+ 'SYNTHETIC_PRIVATE_ID'.repeat(8500) +'"]';
  fs.writeFileSync(filename,oversized);
  assert.ok(Buffer.byteLength(oversized)>128*1024);
  try {
    store.getSubscribers();
    assert.fail('oversized private subscriber file was accepted');
  } catch(error) {
    assert.match(error.message,/subscriber.*(large|limit|invalid|capacity)|oversiz/i);
    assert.doesNotMatch(error.message,/SYNTHETIC_PRIVATE_ID|fg-subscription-validation-/);
  }
  assert.equal(fs.readFileSync(filename,'utf8'),oversized);
});
