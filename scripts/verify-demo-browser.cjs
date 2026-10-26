'use strict';

// Real headless-Chrome E2E of the OFFLINE, LOOPBACK-ONLY demonstration.
// Native Node CDP WebSocket: no Playwright/Puppeteer, CDN, credentials or
// external data sources. This script NEVER imports bot.js or Firebase.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout: sleep } = require('node:timers/promises');
const { createDemoApp } = require('../src/demoServer');

const AUTH_TOKEN='browser-only-fake-secret-never-use-for-any-real-account-2026';
const BROWSER_BINARIES=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser'];

function chromeBinary() {
  for (const file of BROWSER_BINARIES) {
    if (!existsSync(file)) continue;
    const p=spawnSync(file,['--version'],{encoding:'utf8',timeout:2500});
    if(p.status===0) {
      console.log('Browser used for synthetic CI: '+p.stdout.trim());
      return file;
    }
  }
  throw Error('Chrome/Chromium not installed in CI runner: browser E2E did not run');
}
function cdpsocket(url) {
  const ws=new WebSocket(url);
  const outstanding=new Map();
  let nextId=0;
  ws.addEventListener('message',message=>{
    let payload;
    try {payload=JSON.parse(message.data);}catch{return;}
    if(!payload.id || !outstanding.has(payload.id)) return;
    const pair=outstanding.get(payload.id);
    outstanding.delete(payload.id);
    clearTimeout(pair.timer);
    if(payload.error) pair.reject(Error('CDP '+pair.method+': '+payload.error.message));
    else pair.resolve(payload.result);
  });
  ws.addEventListener('close',()=>{
    for(const pair of outstanding.values()) {
      clearTimeout(pair.timer);
      pair.reject(Error('Browser CDP disconnected during '+pair.method));
    }
    outstanding.clear();
  });
  return {
    ws,
    async connected() {
      if(ws.readyState===WebSocket.OPEN)return;
      if(ws.readyState!==WebSocket.CONNECTING)throw Error('CDP socket unavailable');
      await Promise.race([
        once(ws,'open'),sleep(8000).then(()=>{throw Error('CDP WebSocket startup timeout');})
      ]);
    },
    call(method,params={}) {
      assert.equal(ws.readyState,WebSocket.OPEN,'Chrome must be connected');
      const id=++nextId;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          outstanding.delete(id);
          reject(Error('CDP request timed out: '+method));
        },8000);
        outstanding.set(id,{resolve,reject,timer,method});
        ws.send(JSON.stringify({id,method,params}));
      });
    },
    close(){ws.close();}
  };
}

(async()=>{
  const workdir=mkdtempSync(path.join(tmpdir(),'fg-browser-smoke-'));
  let server,chrome,cdp;
  try {
    const app=createDemoApp({token:AUTH_TOKEN,host:'127.0.0.1'});
    server=app.listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    const binary=chromeBinary();
    const profile=path.join(workdir,'chrome-profile');
    chrome=spawn(binary,[
      '--headless=new','--no-first-run','--no-default-browser-check',
      '--disable-extensions','--disable-background-networking','--disable-sync',
      '--disable-component-update','--disable-dev-shm-usage','--no-sandbox',
      '--no-proxy-server','--no-zygote',
      '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
      '--user-data-dir='+profile,'about:blank'
    ],{stdio:'ignore'});
    let endpoint;
    for(let i=0;i<120;i++){
      if(chrome.exitCode!==null)throw Error('Chrome quit before CDP startup');
      const file=path.join(profile,'DevToolsActivePort');
      if(existsSync(file)){
        const port=Number(readFileSync(file,'utf8').split('\n')[0]);
        try{
          const list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
          endpoint=list.find(v=>v.type==='page')?.webSocketDebuggerUrl;
          if(endpoint)break;
        }catch{}
      }
      await sleep(100);
    }
    assert.ok(endpoint,'No local Chrome debugging page found');
    cdp=cdpsocket(endpoint);
    await cdp.connected();
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Network.enable');
    await cdp.call('Network.setExtraHTTPHeaders',{headers:{
      Authorization:'Basic '+Buffer.from('admin:'+AUTH_TOKEN).toString('base64')
    }});
    const external=[];
    // Only localhost demo traffic is permitted. Browser-internal URLs are not network requests.
    cdp.ws.addEventListener('message',msg=>{
      let event;try{event=JSON.parse(msg.data);}catch{return;}
      if(event.method==='Network.requestWillBeSent'){
        const url=event.params?.request?.url||'';
        if(/^https?:/i.test(url) && !url.startsWith(origin+'/'))external.push(url);
      }
    });
    await cdp.call('Page.navigate',{url:origin+'/'});
    async function evaluate(expression) {
      const out=await cdp.call('Runtime.evaluate',{
        expression,returnByValue:true,awaitPromise:true
      });
      if(out.exceptionDetails)throw Error('Browser JS failed: '+out.exceptionDetails.text);
      return out.result.value;
    }
    async function until(expression,label,maxMs=6500) {
      const deadline=Date.now()+maxMs;
      while(Date.now()<deadline){
        if(await evaluate(expression))return;
        await sleep(55);
      }
      throw Error('Headless browser did not reach: '+label);
    }

    await until("document.querySelectorAll('#sensorCards .metric').length===8 && "+
      "document.querySelectorAll('#hostingChecks .diagnostic').length>=5",
      'initial eight cards and disconnected localhost hosting diagnostics');
    assert.equal(await evaluate("document.title.includes('Offline Command Center')"),true);
    assert.equal(await evaluate("document.body.innerText.includes('SIMULATION ONLY')"),true);
    assert.equal(await evaluate("document.querySelector('#acceptanceStatus').textContent.includes('0 of 5')"),true);
    assert.equal(await evaluate("document.querySelector('#hostingChecks').innerText.includes('DISABLED')"),true);
    assert.equal(await evaluate("document.querySelector('#sensorCards').innerText.includes('NOT AVAILABLE')"),true);

    await evaluate("(()=>{const e=document.querySelector('#scenario');e.value='danger';"+
      "e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
    await until("document.querySelector('#scenarioNote').textContent.includes('SYNTHETIC DANGER')",
      'DANGER fixture selection');
    assert.equal(await evaluate("document.querySelector('#sensorCards').innerText.includes('12.0 cm')"),true);
    await evaluate("document.querySelector('[data-command=water]').click();true");
    await until("document.querySelectorAll('#chatLog .bubble').length===2",
      'synthetic command and reply');
    assert.equal(await evaluate("document.querySelector('#chatLog').innerText.includes('synthetic reply')"),true);
    assert.equal(await evaluate("document.querySelector('#chatLog').innerText.includes('not sent')"),true);
    await evaluate("document.querySelector('#clearChat').click();true");
    assert.equal(await evaluate("document.querySelectorAll('#chatLog .bubble').length"),0);

    await evaluate("(()=>{const e=document.querySelector('#scenario');e.value='stale';"+
      "e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
    await until("document.querySelector('#scenarioNote').textContent.includes('SYNTHETIC STALE')",
      'STALE fixture selection');
    assert.equal(await evaluate("document.querySelector('#sensorCards').innerText.includes('NOT AVAILABLE')"),true);

    await evaluate("(()=>{const x=document.querySelector('[data-acceptance=banner]');"+
      "x.click();return true;})()");
    assert.equal(await evaluate("document.querySelector('#acceptanceStatus').textContent.startsWith('1 of 5')"),true);
    await evaluate("document.querySelector('#resetAcceptance').click();true");
    assert.equal(await evaluate("document.querySelector('#acceptanceStatus').textContent.startsWith('0 of 5')"),true);

    // Distinct actual browser viewport sizes: responsive layout and touch target visibility.
    for(const width of [375,768,1440]){
      await cdp.call('Emulation.setDeviceMetricsOverride',{
        width,height:900,deviceScaleFactor:1,mobile:false
      });
      await sleep(120);
      const measured=await evaluate("(()=>{const x=document.documentElement;"+
        "const b=document.querySelector('#previewCommand').getBoundingClientRect();"+
        "const active=document.querySelector('#scenario');"+
        "return {vw:window.innerWidth,sw:x.scrollWidth,buttonX:b.left,"+
        "buttonRight:b.right,buttonHeight:b.height,selectLabel:!!document.querySelector('label[for=scenario]'),"+
        "visible:active.getBoundingClientRect().width>0};})()");
      assert.equal(measured.vw,width);
      assert.ok(measured.sw<=width+2,
        'unexpected horizontal overflow at '+width+'px: '+JSON.stringify(measured));
      assert.ok(measured.buttonX>=-1 && measured.buttonRight<=width+1);
      assert.ok(measured.buttonHeight>=38,'interactive button too small');
      assert.equal(measured.selectLabel,true);
      assert.equal(measured.visible,true);
    }
    await cdp.call('Page.bringToFront');
    const skip=await evaluate("(()=>{const s=document.querySelector('.skip');"+
      "s.focus();return {active:document.activeElement===s,matched:s.matches(':focus'),"+
      "computedTop:getComputedStyle(s).top,rectY:s.getBoundingClientRect().y};})()");
    assert.ok(skip.active && skip.matched && parseFloat(skip.computedTop)>=0,
      'keyboard skip navigation not visible: '+JSON.stringify(skip));
    assert.deepEqual(external,[],'Offline preview attempted an external network request');
    console.log('PASS: headless browser loaded synthetic fixtures, commands, checklist, focus and 375/768/1440px layouts.');
    console.log('Scope: Chromium engine in current CI runner, localhost only; real mobile/WhatsApp/Firebase not tested.');
  } finally {
    try{cdp?.close();}catch{}
    if(chrome && chrome.exitCode===null)chrome.kill('SIGTERM');
    if(server) await new Promise(resolve=>server.close(()=>resolve()));
    rmSync(workdir,{recursive:true,force:true});
  }
})().catch(e=>{console.error('Offline Chrome E2E failed:',e.stack || e.message);process.exitCode=1;});
