'use strict';
// LOCAL, SYNTHETIC filesystem failure tests. Never open real subscriber data.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-private-store-faults-'));
process.env.DATA_PATH=dir;
const store=require('../src/store');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const pathFor=n=>path.join(dir,n);
const oldState={
  initialized:true,level:'DANGER',gateStatus:'CLOSED',
  procedureId:null,sentCountdown:[],sourceAt:Date.now()-1000
};
const newerState={...oldState,level:'SAFE'};

function ready() {
  store.saveState(oldState);
  assert.deepEqual(store.getState(),oldState);
  assert.equal(fs.statSync(pathFor('state.json')).mode & 0o777,0o600,
    'private state must be written with owner-only permissions');
}
function noStaleTemp() {
  assert.deepEqual(fs.readdirSync(dir).filter(p=>/^state\.json\..+\.tmp$/.test(p)),[]);
}

test('predictable attacker-controlled .tmp symlink is never followed during state replacement',()=>{
  ready();
  const bait=pathFor('synthetic-sentinel.txt');
  fs.writeFileSync(bait,'UNMODIFIED SENTINEL');
  const attackerTmp=pathFor('state.json.tmp');
  fs.symlinkSync(bait,attackerTmp);
  store.saveState(newerState);
  assert.equal(fs.readFileSync(bait,'utf8'),'UNMODIFIED SENTINEL');
  assert.equal(fs.lstatSync(pathFor('state.json')).isSymbolicLink(),false);
  assert.deepEqual(store.getState(),newerState);
  assert.equal(fs.lstatSync(attackerTmp).isSymbolicLink(),true);
  fs.unlinkSync(attackerTmp);
  noStaleTemp();
});

test('synthetic disk-full partial write leaves old state intact and no private temp remains',()=>{
  ready();
  const original=fs.writeFileSync;
  try{
    fs.writeFileSync=function(target,...args){
      // Applies to the new file descriptor as well as legacy predictable paths.
      if(typeof target==='number' || String(target).endsWith('state.json.tmp')){
        original.call(fs,target,'PARTIAL-PRIVATE-BYTES');
        const err=new Error('SYNTHETIC SECRET=not-for-logs path='+dir);
        err.code='ENOSPC';
        throw err;
      }
      return original.call(fs,target,...args);
    };
    assert.throws(()=>store.saveState(newerState),err=>
      /local.*write failed|persist|save/i.test(err.message) &&
      !err.message.includes(dir) && !err.message.includes('SECRET='));
  }finally{fs.writeFileSync=original;}
  assert.deepEqual(store.getState(),oldState);
  noStaleTemp();
});

test('synthetic storage rename failure preserves complete old state and removes staged file',()=>{
  ready();
  const oldRename=fs.renameSync;
  try {
    fs.renameSync=function(source,destination){
      if(destination===pathFor('state.json')){
        const err=new Error('SECRET=sensitive-synthetic-data '+dir);
        err.code='EROFS';
        throw err;
      }
      return oldRename.call(fs,source,destination);
    };
    assert.throws(()=>store.saveState(newerState),err=>
      /local.*write failed|persist|save/i.test(err.message) &&
      !err.message.includes(dir) && !err.message.includes('SECRET='));
  }finally{fs.renameSync=oldRename;}
  assert.deepEqual(store.getState(),oldState);
  noStaleTemp();
});

test('failed fsync refuses the state update before the old file can be replaced',()=>{
  ready();
  const original=fs.fsyncSync;
  let called=0;
  try {
    fs.fsyncSync=function(fd){
      called++;
      const err=new Error('PRIVATE-FSYNC-TOKEN synthetic');
      err.code='EIO';
      throw err;
    };
    assert.throws(()=>store.saveState(newerState),err=>
      /local.*write failed|persist|save/i.test(err.message) &&
      !err.message.includes('PRIVATE-FSYNC-TOKEN'));
  }finally{fs.fsyncSync=original;}
  assert.ok(called>=1,'the staged file must be synced before replacement');
  assert.deepEqual(store.getState(),oldState);
  noStaleTemp();
});

test('a leftover simulated crash temp never overrides the last complete state',()=>{
  ready();
  const abandoned=pathFor('state.json.123e4567-e89b-12d3-a456-426614174000.tmp');
  fs.writeFileSync(abandoned,'{PRIVATE-MALFORMED');
  assert.deepEqual(store.getState(),oldState);
  store.saveState(newerState);
  assert.deepEqual(store.getState(),newerState);
  assert.equal(fs.readFileSync(abandoned,'utf8'),'{PRIVATE-MALFORMED',
    'crash remnants must not be silently treated as canonical state or deleted blindly');
  fs.unlinkSync(abandoned);
});
