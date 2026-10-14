'use strict';
// Stage 15 characterization, not a live bot or WhatsApp test.
// Exercise actual src/floodguard.js functions with offline synthetic snapshots.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'floodguard-stage15-native-'));
process.env.DATA_PATH=tmp;
const {level,normalizeGate,commandReply,fieldTimeMs,isStale}=require('../src/floodguard');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','stage15-cross-client-corpus.json'),'utf8'));
const named=id=>{
  const found=corpus.scenarios.find(s=>s.id===id);
  assert.ok(found,'Missing synthetic case '+id);
  return found;
};
const fake=caseId=>{
  const tree=structuredClone(named(caseId).snapshot);
  tree.devices={arduino:'ONLINE',rainGauge:'ONLINE',ultrasonic:'ONLINE'};
  return tree;
};
test('Stage 14 cross-client source snapshot is pinned and contains synthetic-only inputs',()=>{
  assert.equal(corpus.schema,'floodguard-stage14-inspected-client-models-v1');
  assert.equal(corpus.scenarios.length,12);
  assert.match(corpus.inspectedCommits.bot,/^[0-9a-f]{40}$/);
  assert.equal(corpus.sourceDescription.includes('NOT actual Flutter or bot execution'),true);
});
test('native bot water classification matches its documented Stage 14 characterization',()=>{
  for(const item of corpus.scenarios){
    if(item.expect.botWater!==undefined)
      assert.equal(level(item.snapshot),item.expect.botWater,item.id);
  }
  const zero=fake('zero-distance-diverges');
  assert.equal(level(zero),'SAFE','legacy bot ignores zero air gap and uses reported 5 cm');
});
test('actual read-only water command displays zero-distance mismatch without sending',async()=>{
  const tree=fake('zero-distance-diverges');
  const out=await commandReply('synthetic-local-only','water',async()=>tree);
  assert.match(out,/Actual Level: 5 cm/);
  assert.match(out,/Status: \*SAFE\*/);
  assert.doesNotMatch(out,/Status: \*DANGER\*/);
});
test('native gate normalization classifies conflicting raw OPEN and intermediate angle',async()=>{
  for(const id of ['gate-raw-open-but-zero-angle','gate-middle-angle-raw-closed']){
    const item=named(id);
    assert.equal(normalizeGate(item.snapshot),item.expect.botGate,id);
    const output=await commandReply('synthetic-local-only','gate',async()=>fake(id));
    assert.match(output,/Status: \*CLOSED\*/);
  }
});
test('bot risk command uses the reported overallRisk even when the synthetic rain is CRITICAL',async()=>{
  const item=fake('reported-risk-conflicts-derived-rain-critical');
  const output=await commandReply('synthetic-local-only','risk',async()=>item);
  assert.match(output,/Overall Risk: \*LOW\*/);
  assert.match(output,/Water Status: SAFE/);
});
test('missing sensor numbers yield UNKNOWN status, not a fabricated SAFE reading',async()=>{
  const item=fake('sensor-unavailable-fallback-low-risk');
  assert.equal(level(item),'UNKNOWN');
  const water=await commandReply('synthetic-local-only','water',async()=>item);
  assert.match(water,/Actual Level: NOT AVAILABLE/);
  assert.match(water,/Status: \*UNKNOWN\*/);
  const risk=await commandReply('synthetic-local-only','risk',async()=>item);
  assert.match(risk,/Overall Risk: \*UNKNOWN\*/);
});
test('bot retains legacy ONLINE rain category when installed, rather than classifying daily rainfall',async()=>{
  const item=fake('legacy-online-rain-category');
  const output=await commandReply('synthetic-local-only','rain',async()=>item);
  assert.match(output,/Category: ONLINE/);
  assert.match(output,/Accumulated: 120 mm/);
});
test('bot rejects 20-second and future-dated field clocks as live on actual stale predicate',async()=>{
  const old=fake('stale-20s-on-connected-database');
  old.system.lastUpdate=Date.now()-20000;
  assert.equal(isStale(old),true);
  const output=await commandReply('synthetic-local-only','water',async()=>old);
  assert.match(output,/Data: STALE/);
  assert.doesNotMatch(output,/Data: LIVE/);
  const future=fake('future-field-clock');
  future.system.lastUpdate=Date.now()+60000;
  assert.equal(fieldTimeMs(future,Date.now()),null);
  assert.equal(isStale(future),true);
});
test('fresh field clock can be parsed independently of Firebase network status',()=>{
  const now=Date.now(),item=fake('concordant-safe');
  item.system.lastUpdate=now-5000;
  assert.equal(fieldTimeMs(item,now),now-5000);
  assert.equal(isStale(item),false);
  // No Firebase socket or hardware is created; a fresh timestamp alone
  // does not establish physical connectivity or a true device identity.
});
test('test-only source never imports bot entrypoint or starts a WhatsApp session',()=>{
  const source=fs.readFileSync(__filename,'utf8');
  assert.doesNotMatch(source,/require\(['"]\.\.\/bot|useMultiFileAuthState\s*\(|\.listen\s*\(/);
  assert.doesNotMatch(source,/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/);
});
