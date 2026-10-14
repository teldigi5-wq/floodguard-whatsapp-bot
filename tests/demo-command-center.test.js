'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createDemoApp}=require('../src/demoServer');
const {getDemoState,KEYS}=require('../src/demoFixtures');
const {renderCommandCenter}=require('../src/demoCommandCenter');

const secret='synthetic-sandbox-only-private-admin-password-1234567890';
const headers={Authorization:'Basic '+Buffer.from('admin:'+secret).toString('base64')};
async function withDemo(fn){
  const server=createDemoApp({token:secret,port:8085}).listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    await fn('http://127.0.0.1:'+server.address().port);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test('synthetic scenarios are deterministic, labeled and never deliver or control anything',()=>{
  assert.deepEqual(KEYS,['offline','safe','warning','danger']);
  for(const scenario of KEYS){
    const a=getDemoState(scenario),b=getDemoState(scenario);
    assert.deepEqual(a,b);
    assert.equal(a.demoMode,true);
    assert.equal(a.source,'SYNTHETIC FIXTURE');
    assert.equal(a.deliveryEnabled,false);
    assert.equal(a.hardwareControlEnabled,false);
    assert.equal(a.cards.length,4);
    assert.equal(a.alerts.length,3);
    assert.equal(a.diagnostics.length,5);
    assert.ok(a.alerts.every(x=>x.when.startsWith('Example ')));
    assert.equal(a.diagnostics.find(x=>x.id==='whatsapp').status,'DISABLED');
    assert.equal(a.diagnostics.find(x=>x.id==='firebase').status,'DISABLED');
    assert.equal(a.diagnostics.find(x=>x.id==='gate').status,'DISABLED');
    assert.equal(a.cards.find(x=>x.id==='rain').value,'NOT AVAILABLE');
  }
  assert.equal(getDemoState('offline').cards[0].value,'NOT AVAILABLE');
  assert.equal(getDemoState('safe').cards[0].value,'4.0 cm');
  assert.equal(getDemoState('warning').cards[0].value,'9.0 cm');
  assert.equal(getDemoState('danger').cards[0].value,'12.0 cm');
  assert.match(getDemoState('danger').cards[1].value,/example/);
  assert.throws(()=>getDemoState('__proto__'),RangeError);
  assert.throws(()=>getDemoState('subscribe'),RangeError);
});

test('authenticated local state endpoint serves only approved fixtures',async()=>withDemo(async base=>{
  for(const scenario of KEYS){
    const resp=await fetch(base+'/demo/state?scenario='+scenario,{headers});
    assert.equal(resp.status,200);
    assert.match(resp.headers.get('cache-control'),/no-store/);
    const result=await resp.json();
    assert.equal(result.scenario,scenario);
    assert.equal(result.deliveryEnabled,false);
    assert.equal(result.hardwareControlEnabled,false);
  }
  for(const query of ['','?scenario=__proto__','?scenario=subscribe','?scenario=safe&scenario=danger','?scenario=garbage']){
    const res=await fetch(base+'/demo/state'+query,{headers});
    assert.equal(res.status,400,query);
  }
  assert.equal((await fetch(base+'/demo/state?scenario=safe')).status,401);
  assert.equal((await fetch(base+'/demo/state?scenario=danger',{method:'POST',headers})).status,404);
}));

test('offline command center contains accessible chat, cards, history and diagnostics',async()=>withDemo(async base=>{
  const response=await fetch(base+'/',{headers});
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const html=await response.text();
  for(const element of ['sensorCards','scenario','chatLog','chatTitle','command','previewCommand','alertHistory','diagnostics','clearChat','main']){
    assert.match(html,new RegExp('id="'+element+'"'),element);
  }
  assert.match(html,/SIMULATION ONLY · NO LIVE DATA/);
  assert.match(html,/No gate countdown, servo movement or real alert occurs/);
  assert.match(html,/role="log"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/Skip to Command Center/);
  assert.match(html,/prefers-reduced-motion/);
  assert.match(html,/@media\(max-width:750px\)/);
  assert.match(html,/@media\(max-width:420px\)/);
  assert.match(html,/:focus-visible/);
  assert.match(html,/SIMULATED CHAT ONLY/);
  assert.match(html,/fetch\('\/demo\/state/);
  assert.match(html,/fetch\('\/demo\/preview/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script,'Command Center browser script missing');
  assert.doesNotThrow(()=>new vm.Script(script[1]));
  assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)=["']https?:/i, 'Unexpected external resource URL');
}));

test('command-center and fixture modules avoid sensitive dependencies and unsafe HTML interpolation',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../src/demoCommandCenter.js'),'utf8');
  const fixtures=fs.readFileSync(path.join(__dirname,'../src/demoFixtures.js'),'utf8');
  for(const file of [src,fixtures]){
    assert.doesNotMatch(file,/\brequire\(['"](?:@whiskeysockets\/baileys|\.\/firebase|\.\/store|\.\/bot|\.\/floodguard)['"]\)/);
    assert.doesNotMatch(file,/process\.env|useMultiFileAuthState|sendMessage\(|streamLive\(/);
  }
  assert.match(src,/textContent=text/);
  assert.match(src,/replaceChildren\(/);
  assert.doesNotMatch(src,/\.innerHTML\s*=/);
  assert.doesNotMatch(src,/localStorage|sessionStorage|WebSocket\(/);
  assert.doesNotMatch(fixtures,/Date\.now\(|new Date\(|Math\.random\(/);
});
