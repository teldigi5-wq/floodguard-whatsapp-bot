'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdminGuard, validToken } = require('../src/adminAccess');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { once } = require('node:events');

const secret = 'synthetic-test-only-token-0123456789ABCDEF0123456789';
function auth(password = secret, username = 'admin') {
  return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}
async function withServer(token, fn) {
  const app = express();
  const guard = createAdminGuard(token);
  app.get('/', guard, (_req,res)=>res.send('SYNTHETIC-SETUP'));
  app.get('/status', guard, (_req,res)=>res.json({
    connectedNumber:'synthetic-number', lastError:'synthetic-internal-error'
  }));
  app.get('/qr', guard, (_req,res)=>res.send('SYNTHETIC-QR-NOT-A-REAL-CODE'));
  app.get('/health', (_req,res)=>res.json({status:'ok',service:'FloodGuard WhatsApp Bot'}));
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    await fn(base);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
test('token policy rejects missing, short and unsafe configured values',()=>{
  for(const v of [undefined,'', 'not-long-enough', 'x'.repeat(40)+'\n','x'.repeat(40)+' ']){
    assert.equal(validToken(v),false);
  }
  assert.equal(validToken(secret),true);
});
test('admin page, QR and status fail closed with unconfigured secret',async()=>{
  await withServer('',async(base)=>{
    for(const path of ['/','/qr','/status']){
      const response=await fetch(base+path,{headers:{Authorization:auth()}});
      assert.equal(response.status,503,path);
      assert.match(response.headers.get('cache-control'),/no-store/);
      assert.equal(response.headers.get('x-frame-options'),'DENY');
    }
    const health=await fetch(base+'/health');
    assert.equal(health.status,200);
    const result=await health.json();
    assert.deepEqual(result,{status:'ok',service:'FloodGuard WhatsApp Bot'});
  });
});
test('no or wrong credentials cannot retrieve setup, status or QR',async()=>{
  await withServer(secret,async(base)=>{
    for(const path of ['/','/qr','/status']){
      for(const authorization of [undefined,'Bearer '+secret,auth('incorrect'),auth(secret,'other')]){
        const response=await fetch(base+path,{
          headers: authorization ? {Authorization:authorization} : {}
        });
        assert.equal(response.status,401,path);
        assert.match(response.headers.get('www-authenticate'),/^Basic /);
        const content=await response.text();
        assert.ok(!content.includes('synthetic-number'));
        assert.ok(!content.includes('SYNTHETIC-QR-NOT-A-REAL-CODE'));
      }
    }
  });
});
test('correct authorized browser can access existing QR and status routes',async()=>{
  await withServer(secret,async(base)=>{
    for(const path of ['/','/qr','/status']){
      const response=await fetch(base+path,{headers:{Authorization:auth()}});
      assert.equal(response.status,200,path);
      assert.match(response.headers.get('cache-control'),/no-store/);
      assert.equal(response.headers.get('referrer-policy'),'no-referrer');
      assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
    }
  });
});
test('query-string tokens are not accepted; only Basic auth header works',async()=>{
  await withServer(secret,async(base)=>{
    const response=await fetch(base+'/qr?token='+encodeURIComponent(secret));
    assert.equal(response.status,401);
  });
});
test('actual bot entrypoint guards every admin route, health is sanitized',()=>{
  const source=readFileSync(resolve(__dirname,'../bot.js'),'utf8');
  for(const route of ['/', '/status', '/qr']){
    assert.ok(source.includes("app.get('"+route+"', requireSetupAdmin,"),route+' not guarded');
  }
  assert.ok(source.includes("const requireSetupAdmin = createAdminGuard();"));
  const healthBlock=source.slice(source.indexOf("app.get('/health'"),source.indexOf("app.listen("));
  assert.ok(!healthBlock.includes('whatsapp: wa'));
  assert.ok(!healthBlock.includes('firebase: fb'));
  assert.ok(!healthBlock.includes('connectedNumber'));
});
