'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseMode,describeHost}=require('../src/hosting');
const bot=fs.readFileSync(path.join(__dirname,'../bot.js'),'utf8');
const pkg=require('../package.json');
test('PC and EC2 are the only supported runtime profiles',()=>{
  assert.equal(parseMode(),'pc');
  assert.equal(parseMode('PC'),'pc');
  assert.equal(parseMode('ec2'),'ec2');
  assert.throws(()=>parseMode('both'),/pc or ec2/);
  assert.equal(pkg.scripts['start:pc'],'node scripts/start-profile.js pc');
  assert.equal(pkg.scripts['start:ec2'],'node scripts/start-profile.js ec2');
});
test('settings flags expose no host names, token values or data paths',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fg-dual-host-'));
  try{
    const local=describeHost({mode:'pc',host:'127.0.0.1',port:8080,dataPath:dir});
    const cloud=describeHost({mode:'ec2',host:'0.0.0.0',port:8080,dataPath:dir});
    assert.deepEqual([local.profile,local.bindScope,local.storageAccessible],['pc','loopback',true]);
    assert.deepEqual([cloud.profile,cloud.bindScope,cloud.storageAccessible],['ec2','network',true]);
    assert.equal(local.changesRequireRestart,true);
    assert.ok(!JSON.stringify(cloud).includes(dir));
    assert.ok(!JSON.stringify(cloud).includes('FIREBASE_AUTH'));
    assert.equal(describeHost({dataPath:path.join(dir,'missing')}).storageAccessible,false);
    assert.throws(()=>describeHost({port:123456}),/PORT/);
  } finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('protected hosting endpoint is read-only and shares the admin guard',()=>{
  assert.match(bot,/app\.get\('\/hosting', requireSetupAdmin,/);
  assert.match(bot,/res\.json\(hostConfig\)/);
  assert.match(bot,/app\.listen\(PORT, HOST,/);
});
test('portable PM2 remains single-instance and inherits configured mode',()=>{
  const config=require('../ecosystem.portable.config.js');
  assert.equal(config.apps[0].instances,1);
  assert.equal(config.apps[0].env.FLOODGUARD_HOST_MODE,process.env.FLOODGUARD_HOST_MODE||'pc');
  const code=fs.readFileSync(path.join(__dirname,'../scripts/start-profile.js'),'utf8');
  assert.match(code,/require\('\.\.\/bot'\)/);
  assert.ok(fs.existsSync(path.join(__dirname,'../scripts/setup-windows.ps1')));
});

test('premium setup UI exposes functioning hosting settings and read-only preview',()=>{
  const { renderPage } = require('../src/webUi');
  const page=renderPage();
  for(const element of ['hostingSettings','hostingActive','hostingBinding','hostingStorage','hostingProfile','hostingGuide']){
    assert.ok(page.includes('id="'+element+'"'),element+' missing');
  }
  assert.match(page,/fetch\('\/hosting', \{ cache: 'no-store' \}\)/);
  assert.match(page,/hostingProfile'\)\.addEventListener\('change'/);
  assert.match(page,/Active: Windows \/ PC/);
  assert.match(page,/Active: EC2/);
  assert.match(page,/Preview only/);
  assert.doesNotMatch(page,/fetch\('\/hosting', \{ method: 'POST'/);
});

test('rendered Hosting Settings browser script parses as JavaScript',()=>{
  const { Script }=require('node:vm');
  const { renderPage }=require('../src/webUi');
  const page=renderPage();
  const match=page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,'embedded browser script is missing');
  assert.doesNotThrow(()=>new Script(match[1]));
});

test('optional EC2 PM2 config advertises correct host mode and private loopback',()=>{
  const ec2=require('../ecosystem.config.js');
  assert.equal(ec2.apps[0].env.FLOODGUARD_HOST_MODE,'ec2');
  assert.equal(ec2.apps[0].env.HOST,'127.0.0.1');
  assert.equal(ec2.apps[0].instances,1);
});

test('approved EC2 profile settings survive PM2 config evaluation',()=>{
  const file=require.resolve('../ecosystem.portable.config.js');
  const original=process.env.FLOODGUARD_HOST_MODE;
  try {
    process.env.FLOODGUARD_HOST_MODE='ec2';
    delete require.cache[file];
    const config=require('../ecosystem.portable.config.js');
    assert.equal(config.apps[0].env.FLOODGUARD_HOST_MODE,'ec2');
    assert.equal(config.apps[0].env.HOST,process.env.HOST||'127.0.0.1');
  } finally {
    if(original === undefined) delete process.env.FLOODGUARD_HOST_MODE;
    else process.env.FLOODGUARD_HOST_MODE=original;
    delete require.cache[file];
  }
});
