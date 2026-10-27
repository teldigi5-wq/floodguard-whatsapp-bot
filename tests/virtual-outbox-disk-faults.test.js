'use strict';
// Offline-only disk fault injection; fake JIDs, no WhatsApp or Firebase.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createVirtualOutbox}=require('../src/virtualOutbox');
const JID='synthetic-private@s.whatsapp.net';

async function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-outbox-storage-faults-'));
  const now=()=>Date.now();
  const box=createVirtualOutbox({dataDir:dir,now,exclusive:true});
  try {await fn({dir,now,box});}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
}
const obs=now=>({topic:'water',phase:'DANGER',sourceAt:now()-1000});
const job=o=>({key:'synthetic-danger-queued',topic:o.topic,phase:o.phase,
  sourceAt:o.sourceAt,recipients:[JID],text:'SYNTHETIC ONLY - NEVER SENT'});
const canonical=dir=>path.join(dir,'alert-outbox-v1.json');
const temporaryFiles=dir=>fs.readdirSync(dir).filter(n=>/^alert-outbox-v1\.json\..+\.tmp$/.test(n));

test('disk-full partial outbox enqueue never dispatches an uncommitted warning',()=>fixture(async({dir,box,now})=>{
  const observed=obs(now);
  box.observe(observed);
  const oldBytes=fs.readFileSync(canonical(dir),'utf8');
  const write=fs.writeFileSync;
  try {
    fs.writeFileSync=function(target,...args) {
      if(typeof target==='number') {
        write.call(fs,target,'PARTIAL-PRIVATE-RECIPIENT');
        const err=Object.assign(new Error('SECRET=synthetic-credential /private/path'),{code:'ENOSPC'});
        throw err;
      }
      return write.call(fs,target,...args);
    };
    assert.throws(()=>box.enqueue(job(observed)),error=>
      /private storage failure/i.test(error.message) &&
      !/SECRET=|private\/path|synthetic-credential/i.test(error.message));
  } finally {fs.writeFileSync=write;}
  assert.equal(fs.readFileSync(canonical(dir),'utf8'),oldBytes);
  assert.deepEqual(temporaryFiles(dir),[],'partial temp files contain private JIDs');
  let sent=0;
  await assert.rejects(box.drain({observation:observed,
    authorizedRecipients:new Set([JID]),send:async()=>{sent++;}}),
    /private storage failure/i);
  assert.equal(sent,0);
  assert.throws(()=>box.summary(),/private storage failure/i);
  assert.throws(()=>box.close(),/private storage failure/i);
  assert.throws(()=>createVirtualOutbox({dataDir:dir,now,exclusive:true}),
    /locked|owner/i,'the exclusive owner must not be released after storage failure');
}));

test('outbox fsync errors fail closed without replacing the last committed snapshot',()=>fixture(async({dir,box,now})=>{
  const first=obs(now);
  box.observe(first);
  const before=fs.readFileSync(canonical(dir),'utf8');
  const original=fs.fsyncSync;
  let writes=0;
  try {
    fs.fsyncSync=function(...args) {
      writes++;
      throw Object.assign(new Error('FAKE-PRIVATE-FSYNC-URL?auth=secret'),{code:'EIO'});
    };
    assert.throws(()=>box.observe({...first,sourceAt:first.sourceAt+1}),error=>
      /private storage failure/i.test(error.message) &&
      !/FAKE-PRIVATE|auth=/.test(error.message));
  }finally{fs.fsyncSync=original;}
  assert.ok(writes>=1);
  assert.equal(fs.readFileSync(canonical(dir),'utf8'),before);
  assert.deepEqual(temporaryFiles(dir),[]);
  assert.throws(()=>box.observe(first),/private storage failure/i);
}));

test('outbox rename failure is not retried and preserves committed state',()=>fixture(async({dir,box,now})=>{
  const first=obs(now);
  box.observe(first);
  const before=fs.readFileSync(canonical(dir),'utf8');
  const rename=fs.renameSync;
  try {
    fs.renameSync=function(from,to){
      if(to===canonical(dir)) throw Object.assign(new Error('private subscriber URI https://secret.invalid/token'),{code:'EROFS'});
      return rename.call(fs,from,to);
    };
    assert.throws(()=>box.observe({...first,sourceAt:first.sourceAt+1}),error=>
      /private storage failure/i.test(error.message) && !/secret.invalid/.test(error.message));
  }finally{fs.renameSync=rename;}
  assert.equal(fs.readFileSync(canonical(dir),'utf8'),before);
  assert.deepEqual(temporaryFiles(dir),[]);
  assert.throws(()=>box.summary(),/private storage failure/i);
}));

test('failure opening staging file leaves canonical snapshot unchanged and blocks follow-up work',()=>fixture(async({dir,box,now})=>{
  const first=obs(now);
  box.observe(first);
  const before=fs.readFileSync(canonical(dir),'utf8');
  const open=fs.openSync;
  try {
    fs.openSync=function(filename,...args) {
      if(String(filename).startsWith(canonical(dir)+'.') && String(filename).endsWith('.tmp'))
        throw Object.assign(new Error('private disk mount path /secret'),{code:'EROFS'});
      return open.call(fs,filename,...args);
    };
    assert.throws(()=>box.observe({...first,sourceAt:first.sourceAt+1}),
      /private storage failure/i);
  }finally{fs.openSync=open;}
  assert.equal(fs.readFileSync(canonical(dir),'utf8'),before);
  assert.deepEqual(temporaryFiles(dir),[]);
  assert.throws(()=>box.summary(),/private storage failure/i);
}));
