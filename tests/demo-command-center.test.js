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
  assert.deepEqual(KEYS,['offline','safe','warning','danger','stale']);
  for(const scenario of KEYS){
    const a=getDemoState(scenario),b=getDemoState(scenario);
    assert.deepEqual(a,b);
    assert.equal(a.demoMode,true);
    assert.equal(a.source,'SYNTHETIC FIXTURE');
    assert.equal(a.deliveryEnabled,false);
    assert.equal(a.hardwareControlEnabled,false);
    assert.equal(a.cards.length,8);
    assert.equal(a.alerts.length,5);
    assert.equal(a.diagnostics.length,7);
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
  assert.equal(getDemoState('stale').cards[0].value,'NOT AVAILABLE');
  assert.equal(getDemoState('offline').cards.find(x=>x.id==='ultrasonic').value,'NOT AVAILABLE');
  assert.equal(getDemoState('stale').cards.find(x=>x.id==='esp8266').value,'NOT CONNECTED');
  assert.equal(getDemoState('safe').cards.find(x=>x.id==='firebase').value,'NOT CONNECTED');
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
  assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const html=await response.text();
  for(const element of ['sensorCards','scenario','chatLog','chatTitle','command','previewCommand','alertHistory','diagnostics','clearChat','main','hostingChecks','refreshHosting','scenarioNote']){
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
  assert.match(html,/value="stale"/);
  assert.match(html,/local simulation time/);
  assert.match(html,/Hosting Settings/);
  assert.match(html,/fetch\('\/hosting/);
  assert.match(html,/fetch\('\/status/);
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
  assert.doesNotMatch(src,/(?:fetch|sendBeacon)\(['"]https?:/);
  assert.doesNotMatch(fixtures,/Date\.now\(|new Date\(|Math\.random\(/);
});
