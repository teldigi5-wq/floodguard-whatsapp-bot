'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createDemoApp}=require('../src/demoServer');
const {renderPage}=require('../src/webUi');
const secret='A-long-random-looking-SYNTHETIC-demo-test-token_58241_33344';
const auth='Basic '+Buffer.from('admin:'+secret).toString('base64');
async function withDemo(fn){
  const server=createDemoApp({token:secret,port:8085}).listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const url='http://127.0.0.1:'+server.address().port;
    await fn(url);
  } finally {
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
test('no code path imports real WhatsApp, Firebase or device-session clients',()=>{
  const sources=['../src/demoServer.js','../scripts/start-demo.js'].map(x=>fs.readFileSync(path.resolve(__dirname,x),'utf8'));
  for(const source of sources) {
    assert.doesNotMatch(source,/require\(['"](?:@whiskeysockets\/baileys|\.\/firebase|\.\/store|\.\/bot|\.\/floodguard)['"]\)/);
    assert.doesNotMatch(source,/(?:streamLive|startFirebase|processLiveChange|useMultiFileAuthState|sendMessage|https\.request|http\.request)\s*\(/);
  }
});
test('only private localhost can host the offline preview',()=>{
  assert.throws(()=>createDemoApp({token:secret,host:'0.0.0.0'}),/localhost only/);
  assert.throws(()=>createDemoApp({token:'weak'}),/strong private/);
});
test('live setup and data stay private; demo status is explicitly synthetic',async()=>withDemo(async base=>{
  for(const endpoint of ['/','/status','/qr','/hosting']){
    const unauthorized=await fetch(base+endpoint);
    assert.equal(unauthorized.status,401,endpoint);
  }
  const headers={Authorization:auth};
  const status=await fetch(base+'/status',{headers});
  assert.equal(status.status,200);
  const data=await status.json();
  assert.equal(data.demoMode,true);
  assert.equal(data.whatsapp,'DEMO_MODE');
  assert.equal(data.firebase,'NOT_CONNECTED');
  assert.equal(data.hasQr,false);
  assert.equal(data.connectedNumber,null);
  const qr=await fetch(base+'/qr',{headers});
  assert.equal(qr.status,404);
  const page=await (await fetch(base+'/',{headers})).text();
  assert.match(page,/SIMULATION ONLY · NO LIVE DATA/);
  assert.match(page,/Offline FloodGuard Preview/);
  assert.match(page,/option value="warning"/);
  assert.match(page,/No gate countdown, servo movement or real alert occurs/);
  const info=await (await fetch(base+'/hosting',{headers})).json();
  assert.equal(info.demoMode,true);
  assert.equal(info.profile,'pc');
  assert.equal(info.bindScope,'loopback');
  assert.equal(info.storageAccessible,false);
  const health=await (await fetch(base+'/health')).json();
  assert.deepEqual(health,{status:'ok',service:'FloodGuard offline demo'});
  assert.doesNotMatch(JSON.stringify(data)+JSON.stringify(info),/firebaseio\.com|firebasedatabase\.app|auth\/|SECRET|password/i);
}));
test('demo page browser-side script is valid; normal setup stays normal',()=>{
  for(const opts of [{demoMode:true},{}]){
    const page=renderPage(opts);
    const js=page.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(js);
    assert.doesNotThrow(()=>new vm.Script(js[1]));
    assert.ok(page.includes(opts.demoMode?'const launchedAsDemo = true':'const launchedAsDemo = false'));
  }
});

test('command preview returns synthetic read-only replies, never delivers messages',async()=>withDemo(async base=>{
  const headers={Authorization:auth};
  for(const command of ['menu','stats','water','risk','gate','rain','devices','network','emergency']){
    for(const scenario of ['offline','safe','warning','danger']){
      const resp=await fetch(base+'/demo/preview?command='+command+'&scenario='+scenario,{headers});
      assert.equal(resp.status,200,command+'/'+scenario);
      assert.match(resp.headers.get('cache-control'),/no-store/);
      const body=await resp.json();
      assert.equal(body.demoMode,true);
      assert.equal(body.delivered,false);
      assert.match(body.reply,/NOT SENT · NOT LIVE · EXAMPLE ONLY/);
      assert.match(body.reply,/SYNTHETIC ONLY/);
      if(scenario==='offline')assert.doesNotMatch(body.reply,/Water: (4\.0|9\.0|12\.0) cm/);
      if(command==='gate')assert.match(body.reply,/No gate control commands/);
    }
  }
}));
test('preview endpoint enforces admin access and rejects command side effects',async()=>withDemo(async base=>{
  assert.equal((await fetch(base+'/demo/preview?command=stats&scenario=safe')).status,401);
  for(const command of ['subscribe','unsubscribe','restart','gate-open','__proto__','bad']){
    const res=await fetch(base+'/demo/preview?command='+encodeURIComponent(command)+'&scenario=warning',{headers:{Authorization:auth}});
    assert.equal(res.status,400,command);
    assert.doesNotMatch(JSON.stringify(await res.json()),/subscribe\(jid\)|state\.json|sendMessage/);
  }
  for(const args of ['command=stats&scenario=unknown','command=stats','scenario=safe']){
    assert.equal((await fetch(base+'/demo/preview?'+args,{headers:{Authorization:auth}})).status,400);
  }
}));
test('command preview source is a pure module without data stores or network access',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/demoReplies.js'),'utf8');
  assert.doesNotMatch(source,/require\(|fetch\(|process\.env|sendMessage|subscribe\(|\.writeFile|Firebase|https\.get/);
  const {previewReply}=require('../src/demoReplies');
  const result=previewReply('stats','offline');
  assert.match(result,/Water: NOT AVAILABLE/);
  assert.throws(()=>previewReply('subscribe','safe'),RangeError);
});
test('demo command UI includes accessible selector and script parses correctly',()=>{
  const page=renderPage({demoMode:true});
  assert.match(page,/id="demoCommand"/);
  assert.match(page,/id="demoReply"/);
  assert.match(page,/role="status" aria-live="polite"/);
  assert.match(page,/loadDemoReply\(\)/);
  const script=page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(()=>new vm.Script(script[1]));
});
