'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspectConfig,formatReport}=require('../src/preflight');
const validToken='D45a7c7B9e3X4y2K0r9qL6n8m7p2u5w3T1V6h8g4A1Z3P9R7';
function withDir(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'floodguard-doctor-'));
  try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
const good=(dir)=>({
  FLOODGUARD_HOST_MODE:'pc',
  HOST:'127.0.0.1',
  PORT:'8080',
  DATA_PATH:dir,
  FIREBASE_DATABASE_URL:'https://example-default-rtdb.asia-south1.firebasedatabase.app',
  FLOODGUARD_SETUP_TOKEN:validToken,
  FLOODGUARD_STALE_MS:'15000'
});
const status=(report,id)=>report.entries.find(x=>x.id===id)?.kind;
test('valid PC profile passes offline and requires no paired WhatsApp session',()=>withDir(dir=>{
  const report=inspectConfig(good(dir),{cwd:dir,nodeVersion:'22.0.0'});
  assert.equal(report.ok,true,formatReport(report));
  assert.equal(status(report,'session'),'warn');
  assert.match(formatReport(report),/connectivity still unverified/);
}));
test('invalid Node runtime, weak password and network-bound admin fail closed',()=>withDir(dir=>{
  const cfg={...good(dir),HOST:'0.0.0.0',FLOODGUARD_SETUP_TOKEN:'1234'};
  const report=inspectConfig(cfg,{cwd:dir,nodeVersion:'18.20.0'});
  assert.equal(report.ok,false);
  for(const id of ['node','binding','setup-token'])assert.equal(status(report,id),'fail');
}));
test('reject URL credentials, HTTP protocol, query strings and untrusted RTDB origins',()=>withDir(dir=>{
  for(const url of ['http://example.firebaseio.com','https://example.firebaseio.com/?auth=x','https://user:pass@example.firebaseio.com/','https://firebasedatabase.app.evil.invalid/','https://example.invalid/']){
    const report=inspectConfig({...good(dir),FIREBASE_DATABASE_URL:url},{cwd:dir,nodeVersion:'22'});
    assert.equal(status(report,'firebase-url'),'fail',url);
  }
}));
test('EC2 requires absolute persistent path, PC accepts existing directory',()=>withDir(dir=>{
  const bad=inspectConfig({...good(dir),FLOODGUARD_HOST_MODE:'ec2',DATA_PATH:'./data'},{cwd:dir,nodeVersion:'22'});
  assert.equal(status(bad,'data-path'),'fail');
  const ok=inspectConfig({...good(dir),FLOODGUARD_HOST_MODE:'ec2'},{cwd:dir,nodeVersion:'22'});
  assert.equal(status(ok,'data-path'),'pass');
}));
test('missing data directory and unsupported modes are rejected',()=>withDir(dir=>{
  const miss=inspectConfig({...good(dir),DATA_PATH:path.join(dir,'missing')},{cwd:dir,nodeVersion:'22'});
  assert.equal(status(miss,'data-path'),'fail');
  const mode=inspectConfig({...good(dir),FLOODGUARD_HOST_MODE:'both'},{cwd:dir,nodeVersion:'22'});
  assert.equal(status(mode,'mode'),'fail');
}));
test('private values and paths are never exposed in CLI report',()=>withDir(dir=>{
  const secret=validToken;
  const source={...good(dir),FIREBASE_AUTH:'secret-firebase-auth-value',FLOODGUARD_SETUP_TOKEN:secret};
  const result=formatReport(inspectConfig(source,{cwd:dir,nodeVersion:'22'}));
  for(const value of [secret,dir,source.FIREBASE_DATABASE_URL,source.FIREBASE_AUTH])assert.ok(!result.includes(value));
}));
