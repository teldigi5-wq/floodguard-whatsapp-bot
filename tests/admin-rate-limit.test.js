'use strict';
// Synthetic localhost-only admin throttle tests. No real token or remote host.
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {once}=require('node:events');
const {createAdminGuard}=require('../src/adminAccess');

const TOKEN='LOCAL_TEST_ONLY_LONG_FAKE_TOKEN_1234567890abcdef';
function basic(password=TOKEN) {
  return 'Basic '+Buffer.from('admin:'+password).toString('base64');
}
async function withAdmin(nowRef,fn) {
  const app=express();
  const guard=createAdminGuard(TOKEN,{
    now:()=>nowRef.value, maxFailedAttempts:3,
    windowMs:1000, lockoutMs:2000
  });
  app.get('/',guard,(_req,res)=>res.send('SYNTHETIC ADMIN'));
  app.get('/qr',guard,(_req,res)=>res.send('NOT A QR'));
  app.get('/status',guard,(_req,res)=>res.json({synthetic:true}));
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    await fn('http://127.0.0.1:'+server.address().port);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
test('wrong admin credentials across endpoints trigger a shared temporary lockout',async()=>{
  const clock={value:Date.now()};
  await withAdmin(clock,async base=>{
    for(const route of ['/','/qr']) {
      const response=await fetch(base+route,{
        headers:{Authorization:basic('wrong-secret')}
      });
      assert.equal(response.status,401);
      assert.match(response.headers.get('cache-control'),/no-store/);
    }
    const third=await fetch(base+'/status',{headers:{Authorization:basic('wrong-secret')}});
    assert.equal(third.status,429,'third unsuccessful login must throttle the private setup');
    assert.equal(third.headers.get('retry-after'),'2');
    assert.doesNotMatch(await third.text(),/wrong-secret|LOCAL_TEST_ONLY|auth/i);
    const correctDuringLock=await fetch(base+'/',{headers:{Authorization:basic()}});
    assert.equal(correctDuringLock.status,429,'correct token must not bypass lockout');
    assert.match(correctDuringLock.headers.get('cache-control'),/no-store/);
    clock.value+=2001;
    const approved=await fetch(base+'/status',{headers:{Authorization:basic()}});
    assert.equal(approved.status,200);
    assert.deepEqual(await approved.json(),{synthetic:true});
    const nextWrong=await fetch(base+'/qr',{headers:{Authorization:basic('wrong')}});
    assert.equal(nextWrong.status,401,'successful login reset the old failure budget');
  });
});
test('failure window expires and spoofed forwarded IP cannot reset a blocked local guard',async()=>{
  const clock={value:Date.now()};
  await withAdmin(clock,async base=>{
    for(let i=0;i<2;i++) {
      const res=await fetch(base+'/',{headers:{Authorization:basic('bad')}});
      assert.equal(res.status,401);
    }
    clock.value+=1001;
    assert.equal((await fetch(base+'/',{headers:{Authorization:basic('bad')}})).status,401,
      'expired failure window must reset');
    assert.equal((await fetch(base+'/',{headers:{Authorization:basic('bad')}})).status,401);
    assert.equal((await fetch(base+'/',{headers:{Authorization:basic('bad')}})).status,429);
    const spoofed=await fetch(base+'/status',{headers:{
      Authorization:basic(), 'X-Forwarded-For':'203.0.113.200'
    }});
    assert.equal(spoofed.status,429,'untrusted forwarded client IP must not bypass lockout');
    assert.equal(spoofed.headers.get('access-control-allow-origin'),null);
  });
});
test('invalid injected guard policies fail closed at configuration time',()=>{
  for(const opts of [
    {maxFailedAttempts:0},{maxFailedAttempts:100000},{windowMs:-1},
    {lockoutMs:Infinity},{now:null},{now:1}
  ]) assert.throws(()=>createAdminGuard(TOKEN,opts),/invalid|throttle|policy/i);
});
