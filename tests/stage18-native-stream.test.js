'use strict';
// Stage 18: Execute actual PURE Firebase SSE event projection and field-clock
// parser. NEVER call streamLive/getLive, bot.js or WhatsApp.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PUBLIC_PATHS,applyEvent}=require('../src/firebase');
const {fieldTimeMs}=require('../src/floodguard');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/stage18-shared-child-stream.json','utf8'));
const apply=(root,event)=>applyEvent(root,event.branch,event.kind,JSON.parse(JSON.stringify(event.packet)));
const snapshot=caseInfo=>{
  const state={};
  for(const step of [...fixture.setup,...caseInfo.operations])apply(state,step);
  return state;
};
test('the same 9 public child streams and exactly 8 simulated cross-repo scenarios are used',()=>{
  assert.equal(fixture.schema,'floodguard-stage18-transport-contract-v1');
  assert.equal(fixture.evidence,'SYNTHETIC_LOCAL_REPLAY_ONLY');
  assert.equal(fixture.releaseDecision,'NO_GO');
  assert.deepEqual([...PUBLIC_PATHS],fixture.publicPaths);
  assert.equal(fixture.setup.length,9);
  assert.equal(fixture.scenarios.length,8);
});
test('native bot Firebase put/patch reassembly agrees with every shared reference snapshot',()=>{
  for(const scenario of fixture.scenarios){
    const result=snapshot(scenario);
    assert.deepEqual(result,scenario.expectedPublic,scenario.id);
    assert.equal(result.esp8266?.ip,undefined,scenario.id);
    assert.equal(result.esp8266?.wifi,undefined,scenario.id);
  }
});
test('the native bot parser maintains original source clocks without stamping reconnect time',()=>{
  for(const scenario of fixture.scenarios){
    const state=snapshot(scenario);
    const stamp=fieldTimeMs(state,scenario.nowMs);
    const age=stamp===null?null:Math.max(0,Math.floor((scenario.nowMs-stamp)/1000));
    assert.equal(age,scenario.ageSeconds,scenario.id);
    const classification=!scenario.connected||stamp===null||scenario.nowMs-stamp>15000?'stale':'within-window';
    assert.equal(classification,scenario.policy.bot,scenario.id);
  }
});
test('one null PATCH field is deleted, not treated as a fresh numeric zero',()=>{
  const state=snapshot(fixture.scenarios.find(x=>x.id==='null-field-and-private-child-deletion'));
  assert.equal(Object.hasOwn(state.rain,'currentMm'),false);
  assert.equal(Object.hasOwn(state.esp8266,'rssi'),false);
  assert.equal(state.rain.dailyMm,0);
});
test('child-only put can modify gate angle without rewriting the entire gate state',()=>{
  const state=snapshot(fixture.scenarios.find(x=>x.id==='child-path-put-without-parent-write'));
  assert.equal(state.gate.angle,45);
  assert.equal(state.gate.status,'CLOSED');
  assert.equal(state.gate.countdownSeconds,0);
});
test('invalid future source timestamp does not count as recent bot data',()=>{
  const s=fixture.scenarios.find(x=>x.id==='future-source-clock');
  assert.equal(fieldTimeMs(snapshot(s),s.nowMs),null);
});
test('all disallowed private and parent path requests are rejected before reassembly',()=>{
  for(const name of fixture.deniedBranches){
    assert.ok(!PUBLIC_PATHS.includes(name),name);
    assert.throws(()=>applyEvent({},name,'put',{path:'/',data:'SYNTHETIC'}),/Private Firebase path/);
  }
});
test('offline contract has no WhatsApp, Firebase endpoint, subscriber or hardware operation',()=>{
  const src=fs.readFileSync(__filename,'utf8');
  assert.doesNotMatch(src,/require\(['"]\.\.\/bot|\.listen\s*\(|sendMessage\s*\(/);
  assert.doesNotMatch(src,/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/);
  const serialized=JSON.stringify(fixture.setup)+JSON.stringify(fixture.scenarios);
  assert.doesNotMatch(serialized,/password|apiKey|authToken|firebaseio\\.com|firebasedatabase\\.app|192\\.168\\./i);
});
