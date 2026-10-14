'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const bot=fs.readFileSync(path.join(root,'bot.js'),'utf8');
const sample=fs.readFileSync(path.join(root,'.env.example'),'utf8');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
const pm2=require('../ecosystem.portable.config.js');

test('admin service is loopback-only unless explicitly configured',()=>{
  assert.match(bot,/const HOST = process\.env\.HOST \|\| '127\.0\.0\.1'/);
  assert.match(bot,/app\.listen\(PORT, HOST,/);
  assert.doesNotMatch(bot,/app\.listen\(PORT, '0\.0\.0\.0'/);
  assert.match(sample,/^HOST=127\.0\.0\.1$/m);
});

test('portable PM2 runner uses one instance and does not require EC2/AWS',()=>{
  assert.equal(pm2.apps.length,1);
  const app=pm2.apps[0];
  assert.equal(app.script,'bot.js');
  assert.equal(app.cwd,root);
  assert.equal(app.instances,1);
  assert.equal(app.watch,false);
  assert.equal(app.exec_mode,'fork');
  assert.ok(path.isAbsolute(app.env.DATA_PATH));
  assert.ok(app.env.HOST);
  assert.ok(!JSON.stringify(app).includes('EC2_HOST'));
  assert.ok(!JSON.stringify(app).includes('EC2_KEY'));
});

test('portable build retains persistent credentials and explicit setup authorization',()=>{
  assert.match(bot,/useMultiFileAuthState\(AUTH\)/);
  assert.match(bot,/path\.join\(DATA_PATH, 'auth'\)/);
  assert.match(bot,/createAdminGuard\(\)/);
  assert.match(readme,/docs\/RECOVERY_WITHOUT_AWS\.md/);
});

test('data and auth state are not included in the repository',()=>{
  const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
  assert.match(ignore,/^data\/$/m);
  assert.match(ignore,/^\.env$/m);
});

test('PM2 loads host-owned private settings and never assumes cloud filesystem is ephemeral',()=>{
  const src=fs.readFileSync(path.join(root,'ecosystem.portable.config.js'),'utf8');
  assert.match(src,/require\('dotenv'\)\.config\(\{ path: path\.join\(__dirname, '\.env'\) \}\)/);
  assert.match(src,/path\.resolve\(__dirname, process\.env\.DATA_PATH\)/);
  assert.equal(pm2.apps[0].env.FLOODGUARD_HOST_MODE,process.env.FLOODGUARD_HOST_MODE||'pc');
});
