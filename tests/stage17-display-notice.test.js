'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {stage17PreviewNotice,STAGE17_SYNTHETIC_SCENARIOS}
  =require('../src/stage17ReviewNotice');
const corpus=require('./fixtures/stage15-cross-client-corpus.json');
const expected=new Set(corpus.scenarios.map(x=>x.id));

test('Stage 17 notices cover inspected Stage 14 synthetic examples only',()=>{
  assert.equal(STAGE17_SYNTHETIC_SCENARIOS.length,9);
  for(const id of STAGE17_SYNTHETIC_SCENARIOS)assert.ok(expected.has(id),id);
});
test('each candidate reply is labelled REVIEW-ONLY, SYNTHETIC, NOT SENT and NOT LIVE',()=>{
  for(const id of STAGE17_SYNTHETIC_SCENARIOS){
    const note=stage17PreviewNotice(id);
    for(const word of ['REVIEW-ONLY','SYNTHETIC','NOT SENT','NOT LIVE','not a safety decision'])
      assert.match(note,new RegExp(word,'i'),id);
    assert.doesNotMatch(note,/your dam is confirmed safe|gate has opened|alert delivered/i);
  }
});
test('zero-gap ambiguity is not reformatted into confident SAFE or DANGER',()=>{
  const x=stage17PreviewNotice('zero-distance-diverges');
  assert.match(x,/WATER READING UNVERIFIED/);
  assert.doesNotMatch(x,/\bSAFE\b|\bDANGER\b/);
});
test('gate contradictions produce accessible words instead of color-only cues',()=>{
  for(const id of ['gate-raw-open-but-zero-angle','gate-middle-angle-raw-closed']){
    const x=stage17PreviewNotice(id);
    assert.match(x,/GATE POSITION CONFLICT/);
    assert.match(x,/Actual position is unknown/);
  }
});
test('critical-rain / reported LOW risk and unknown inputs do not produce risk LOW',()=>{
  for(const id of ['reported-risk-conflicts-derived-rain-critical',
    'sensor-unavailable-fallback-low-risk']){
    const x=stage17PreviewNotice(id);
    assert.match(x,/RISK REQUIRES REVIEW/);
    assert.doesNotMatch(x,/Overall risk: LOW|SAFE CONFIRMED/);
  }
});
test('a reported SAFE value is distinguished from a physically verified one',()=>{
  const x=stage17PreviewNotice('concordant-safe');
  assert.match(x,/SAFE REPORTED — NOT VERIFIED/);
  assert.match(x,/not independently physically verified/);
});
test('unreviewed or hostile scenario text cannot inject a command or raw data',()=>{
  for(const id of [null,undefined,{},'__proto__',
    'zero-distance-diverges\n/sent','subscribe','../../bot.js']){
    assert.throws(()=>stage17PreviewNotice(id),RangeError);
  }
});
test('the preview formatter is not imported by runtime bot or demo replies',()=>{
  const bot=fs.readFileSync('bot.js','utf8');
  const live=fs.readFileSync('src/floodguard.js','utf8');
  const demo=fs.readFileSync('src/demoReplies.js','utf8');
  assert.doesNotMatch(bot,/stage17ReviewNotice/);
  assert.doesNotMatch(live,/stage17ReviewNotice/);
  assert.doesNotMatch(demo,/stage17ReviewNotice/);
  const helper=fs.readFileSync('src/stage17ReviewNotice.js','utf8');
  assert.doesNotMatch(helper,/require\(['"](?:@whiskeysockets|\.\/firebase|\.\/store)/);
  assert.doesNotMatch(helper,/process\.env|\.listen\s*\(|sendMessage\s*\(/);
});
