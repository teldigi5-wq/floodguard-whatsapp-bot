'use strict';
// QA-only Chromium checks; this suite never imports the real bot or Firebase.
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const {createDemoApp}=require('../src/demoServer');

const token='BROWSER_QA_SYNTHETIC_ADMIN_TOKEN_1234567890_ABCD_1234567890';
const allowed=new Set(['/','/hosting','/status','/demo/state','/demo/preview']);
const viewports=[
  {name:'narrow-phone',width:320,height:640},
  {name:'phone',width:390,height:844},
  {name:'tablet',width:768,height:1024},
  {name:'laptop',width:1024,height:768},
  {name:'desktop',width:1440,height:900}
];
async function withBrowser(fn){
  const server=createDemoApp({token,port:8085,host:'127.0.0.1'}).listen(0,'127.0.0.1');
  let browser;
  try{
    await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true});
    await fn({browser,base});
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
async function openDemo(browser,base,viewport,reducedMotion='reduce'){
  const context=await browser.newContext({
    viewport,httpCredentials:{username:'admin',password:token},
    reducedMotion,serviceWorkers:'block'
  });
  const page=await context.newPage();
  const unexpected=[];
  const errors=[];
  const consoleErrors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base||!allowed.has(url.pathname)){
      unexpected.push(url.origin===base?url.pathname:url.origin);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const res=await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  assert.equal(res.status(),200);
  await page.waitForFunction(()=>document.querySelectorAll('#sensorCards .metric').length===8);
  await page.waitForFunction(()=>document.querySelectorAll('#hostingChecks .diagnostic').length===5);
  return {page,context,unexpected,errors,consoleErrors};
}

test('desktop, laptop, tablet and narrow mobile viewports have no horizontal overflow or external requests',async t=>{
  await withBrowser(async ({browser,base})=>{
    for(const viewport of viewports){
      await t.test(viewport.name,async ()=>{
        const {page,context,unexpected,errors,consoleErrors}=await openDemo(browser,base,viewport);
        try{
          const sizes=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:window.innerWidth}));
          assert.ok(sizes.page<=sizes.viewport+1,JSON.stringify({viewport,sizes}));
          assert.equal(await page.locator('#sensorCards .metric').count(),8);
          assert.equal(await page.locator('#alertHistory li').count(),5);
          assert.equal(await page.locator('button[data-command]').count(),9);
          assert.match(await page.locator('#scenarioNote').innerText(),/SYNTHETIC UNAVAILABLE/);
          assert.deepEqual(unexpected,[],'Browser must not request outside local fixtures');
          assert.deepEqual(errors,[],'Unexpected browser script error');
          assert.deepEqual(consoleErrors,[],'Unexpected browser console errors or blocked CSP declarations');
          if(viewport.width===320||viewport.width===1440){
            const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
            assert.deepEqual(audit.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(y=>y.target)})),[]);
          }
        }finally{await context.close();}
      });
    }
  });
});

test('all scenarios and commands are simulated; stale/offline never show live readings',async ()=>{
  await withBrowser(async ({browser,base})=>{
    const {page,context,unexpected,errors}=await openDemo(browser,base,viewports[1]);
    try{
      for(const scenario of ['safe','warning','danger','offline','stale']){
        await page.locator('#scenario').selectOption(scenario);
        await page.waitForFunction(value=>document.querySelector('#scenarioNote').textContent.includes('SYNTHETIC '+value.toUpperCase())||(value==='offline'&&document.querySelector('#scenarioNote').textContent.includes('SYNTHETIC UNAVAILABLE')),scenario);
        const water=await page.locator('#sensorCards .metric').first().locator('.metric-value').innerText();
        if(scenario==='offline'||scenario==='stale')assert.equal(water,'NOT AVAILABLE');
        else assert.match(water,/cm$/);
        assert.match(await page.locator('#scenarioNote').innerText(),/Firebase and physical sensors are disconnected/);
        await page.locator('#command').selectOption('stats');
        await page.locator('#previewCommand').click();
        await page.waitForFunction(()=>document.querySelectorAll('#chatLog .bubble').length===2);
        const reply=await page.locator('#chatLog .bubble.system').innerText();
        assert.match(reply,/NOT SENT · NOT LIVE · EXAMPLE ONLY/);
        if(scenario==='stale')assert.match(reply,/Stale telemetry example/);
        if(scenario==='offline'||scenario==='stale')assert.match(reply,/Water: NOT AVAILABLE/);
        await page.locator('#clearChat').click();
      }
      for(const command of ['menu','water','risk','gate','rain','devices','network','emergency']){
        await page.locator('#command').selectOption(command);
        await page.locator('#previewCommand').click();
        await page.waitForFunction(()=>document.querySelectorAll('#chatLog .bubble').length===2);
        assert.match(await page.locator('#chatLog .bubble.system').innerText(),/NOT SENT/);
        await page.locator('#clearChat').click();
      }
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
});

test('keyboard focus, reduced-motion, pending-preview cancellation and accessible status survive',async ()=>{
  await withBrowser(async ({browser,base})=>{
    const {page,context,unexpected,errors}=await openDemo(browser,base,viewports[0]);
    try{
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').getAttribute('href'),'#main','Skip link is the first keyboard stop');
      assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
      await page.locator('#command').selectOption('water');
      // Hold one local fixture reply; scenario switching must restore the button.
      await page.route('**/demo/preview?**',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
      await page.locator('#previewCommand').click();
      await page.locator('#scenario').selectOption('stale');
      assert.equal(await page.locator('#previewCommand').isEnabled(),true);
      await page.waitForFunction(()=>document.querySelector('#scenarioNote').textContent.includes('SYNTHETIC STALE'));
      await page.waitForTimeout(330);
      assert.equal(await page.locator('#chatLog .bubble').count(),0,'Obsolete reply must be discarded');
      assert.match(await page.locator('#scenarioNarration').textContent(),/Synthetic scenario stale loaded/);
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
});

test('failed local fixture, reply and hosting requests fail closed without inventing data',async ()=>{
  await withBrowser(async ({browser,base})=>{
    const {page,context,unexpected,errors}=await openDemo(browser,base,viewports[1]);
    try{
      await page.route('**/demo/state?**',route=>route.abort('failed'));
      await page.locator('#scenario').selectOption('danger');
      await page.waitForFunction(()=>document.querySelector('#scenarioNote').textContent.includes('LOCAL PREVIEW UNAVAILABLE'));
      assert.equal(await page.locator('#sensorCards .metric').count(),0);
      assert.equal(await page.locator('#alertHistory li').count(),0);
      assert.match(await page.locator('#chatLog').innerText(),/No commands were sent/);
      await page.route('**/demo/preview?**',route=>route.abort('failed'));
      await page.locator('#previewCommand').click();
      await page.waitForFunction(()=>document.querySelector('#chatLog').textContent.includes('Example unavailable'));
      assert.match(await page.locator('#chatLog').innerText(),/No message was sent/);
      await page.route('**/hosting',route=>route.abort('failed'));
      await page.locator('#refreshHosting').click();
      await page.waitForFunction(()=>document.querySelector('#hostingChecks').textContent.includes('LOCAL CHECK UNAVAILABLE'));
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
});
