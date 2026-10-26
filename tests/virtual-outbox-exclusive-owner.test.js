'use strict';
// Synthetic filesystem-only ownership tests; never starts a live bot.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createVirtualOutbox}=require('../src/virtualOutbox');
const MODULE=path.resolve(__dirname,'../src/virtualOutbox.js');

function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-exclusive-owner-'));
  try { return fn(dir); } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
function child(dir,abrupt=false) {
  const script=String.raw`const {createVirtualOutbox}=require(process.argv[1]);
try {
  const x=createVirtualOutbox({dataDir:process.argv[2],exclusive:true});
  if (!process.argv.includes('--abrupt')) x.close();
  process.exit(0);
} catch { process.stderr.write('LOCKED'); process.exit(42); }`;
  return spawnSync(process.execPath,['-e',script,MODULE,dir,...(abrupt?['--abrupt']:[])],
    {encoding:'utf8',timeout:4000});
}

test('exclusive virtual owner fences another actual Node process until explicit close',()=>
  fixture(dir=>{
    const owner=createVirtualOutbox({dataDir:dir,exclusive:true});
    try {
      const refused=child(dir);
      assert.equal(refused.status,42);
      assert.equal(refused.stderr,'LOCKED');
    } finally { owner.close(); }
    const allowed=child(dir);
    assert.equal(allowed.status,0);
    assert.equal(allowed.stderr,'');
  })
);

test('crash leftover ownership fails closed; no automatic lock stealing',()=>
  fixture(dir=>{
    const original=child(dir,true);
    assert.equal(original.status,0);
    assert.throws(()=>createVirtualOutbox({dataDir:dir,exclusive:true}),/exclusive|owner|locked/i);
    const second=child(dir);
    assert.equal(second.status,42);
    // Recovery is an explicit operator-only action in this synthetic fixture.
    fs.unlinkSync(path.join(dir,'alert-outbox-v1.owner'));
    const replacement=createVirtualOutbox({dataDir:dir,exclusive:true});
    replacement.close();
  })
);

test('previously opened unowned instance cannot write while an exclusive owner exists',()=>
  fixture(dir=>{
    const legacy=createVirtualOutbox({dataDir:dir});
    const owner=createVirtualOutbox({dataDir:dir,exclusive:true});
    const observation={topic:'water',phase:'DANGER',sourceAt:Date.now()-1000};
    try {
      assert.throws(()=>legacy.observe(observation),/exclusive|owner|locked/i);
      assert.throws(()=>legacy.summary(),/exclusive|owner|locked/i);
      assert.equal(owner.observe(observation),true);
    } finally { owner.close(); }
    assert.equal(legacy.observe(observation),true);
  })
);

test('closed owner cannot mutate or read the private outbox',()=>
  fixture(dir=>{
    const owner=createVirtualOutbox({dataDir:dir,exclusive:true});
    owner.close();
    assert.throws(()=>owner.summary(),/closed|owner/i);
    assert.throws(()=>owner.observe({topic:'water',phase:'DANGER',sourceAt:Date.now()-1000}),/closed|owner/i);
  })
);
