'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createDemoApp}=require('../src/demoServer');
const {renderCommandCenter}=require('../src/demoCommandCenter');

const token='SYNTHETIC_STAGE4_OPERATOR_ADMIN_TOKEN_123456789ABC';
const auth={Authorization:'Basic '+Buffer.from('admin:'+token).toString('base64')};
async function withServer(cb){
  const server=createDemoApp({token,host:'127.0.0.1'}).listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port;
    await cb(url);
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
test('localhost request authority is validated against actual port and blocks DNS-rebinding-style hostnames',async()=>withServer(async url=>{
  for(const route of ['/','/status','/hosting','/demo/state?scenario=safe','/demo/preview?command=stats&scenario=safe','/health']){
    const res=await fetch(url+route,{headers:auth});
    assert.equal(res.status,200,route);
    for(const forged of ['demo.attacker.example:4242','localhost:4545','127.0.0.1:9999','127.0.0.1.example:4242']){
      // Undici fetch does not reliably forward an overridden Host header.
      // Use a raw, loopback-only HTTP client to actually send the forged wire header.
      const target=new URL(url+route);
      const bad=await new Promise((resolve,reject)=>{
        const request=http.request({
          hostname:'127.0.0.1',port:Number(target.port),path:target.pathname+target.search,
          method:'GET',headers:{...auth,Host:forged}
        },response=>{
          response.resume();
          response.on('end',()=>resolve({status:response.statusCode,headers:response.headers}));
        });
        request.once('error',reject);
        request.end();
      });
      assert.equal(bad.status,421,route+' host='+forged);
      assert.equal(bad.headers['access-control-allow-origin'],undefined);
    }
  }
}));
test('untrusted origins and cross-site fetch metadata are rejected before demo routes',async()=>withServer(async url=>{
  const origin=url;
  const valid=await fetch(url+'/demo/state?scenario=offline',{headers:{...auth,Origin:origin,'Sec-Fetch-Site':'same-origin'}});
  assert.equal(valid.status,200);
  for(const bad of [
    {Origin:'https://untrusted.example'},
    {Origin:'null'},
    {'Sec-Fetch-Site':'cross-site'},
    {'Sec-Fetch-Site':'same-site'},
    {...{Origin:origin},'Sec-Fetch-Site':'cross-site'}
  ]){
    const response=await fetch(url+'/demo/state?scenario=danger',{headers:{...auth,...bad}});
    assert.equal(response.status,403,JSON.stringify(bad));
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  const direct=await fetch(url+'/status',{headers:{...auth,'Sec-Fetch-Site':'none'}});
  assert.equal(direct.status,200);
}));
test('all routes use conservative privacy headers and no leaked setup token',async()=>withServer(async url=>{
  for(const route of ['/','/status','/hosting','/demo/state?scenario=stale','/demo/preview?command=risk&scenario=stale','/health','/missing']){
    const response=await fetch(url+route,{headers:auth});
    assert.match(response.headers.get('cache-control')||'',/no-store/);
    assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
    assert.equal(response.headers.get('x-frame-options'),'DENY');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.doesNotMatch(await response.text(),new RegExp(token));
  }
}));
test('side-effect verbs, pairing route and unknown commands never modify state',async()=>withServer(async url=>{
  for(const method of ['POST','PUT','PATCH','DELETE']){
    for(const route of ['/demo/state?scenario=safe','/demo/preview?scenario=safe&command=gate','/qr','/hosting']){
      const res=await fetch(url+route,{method,headers:auth});
      assert.equal(res.status,404,method+' '+route);
    }
  }
  assert.equal((await fetch(url+'/qr',{headers:auth})).status,404);
  for(const bad of ['subscribe','restart','gate-open','__proto__','constructor']){
    assert.equal((await fetch(url+'/demo/preview?scenario=safe&command='+bad,{headers:auth})).status,400);
  }
}));
test('operator checklist remains browser-memory only and cannot be mistaken for a release gate',()=>{
  const page=renderCommandCenter();
  assert.match(page,/0 of 5 manually reviewed\. No deployment approval granted/);
  assert.equal((page.match(/data-acceptance="/g)||[]).length,5);
  assert.match(page,/updateAcceptance\(/);
  assert.match(page,/input\.checked=false/);
  assert.doesNotMatch(page,/localStorage|sessionStorage|indexedDB|\.innerHTML\s*=/);
  const server=fs.readFileSync(path.join(__dirname,'../src/demoServer.js'),'utf8');
  assert.doesNotMatch(server,/require\(['"](?:@whiskeysockets\/baileys|\.\/firebase|\.\/store)['"]\)/);
  assert.doesNotMatch(server,/sendMessage\(|streamLive\(/);
});
