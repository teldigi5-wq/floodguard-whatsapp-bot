'use strict';
// Pure synthetic logic only: no Firebase, Baileys, WhatsApp, recipients,
// disk state, hardware gate, real sensor or public alert delivery.
const test = require('node:test');
const assert = require('node:assert/strict');
const { level, waterLevelCm, risk, isStale } = require('../src/floodguard');
const { planVirtualWaterSnapshot } = require('../src/virtualAlertPlanner');

const observed=(distanceCm,status='UNKNOWN',reported='LOW',ts=Date.now())=>({
  water:{distanceCm,status,levelCm:0},
  system:{lastUpdate:ts,overallRisk:reported}
});

test('HC-SR04 transducer max 400cm must not bypass 25cm installation calibration',()=>{
  for(const gap of [25.0001,26,99,400,401]){
    const x=observed(gap);
    assert.equal(waterLevelCm(x),null,String(gap));
    assert.equal(level(x),'UNKNOWN',String(gap));
    assert.equal(risk(x),'UNKNOWN',String(gap));
  }
  assert.equal(waterLevelCm(observed(25)),0);
  assert.equal(level(observed(25)),'SAFE');
  assert.equal(level(observed(16.5)),'WARNING');
  assert.equal(level(observed(14)),'DANGER');
});

test('explicit bad sensor status wins over placeholder SAFE distance and backend LOW',()=>{
  for(const status of [
    'SENSOR_ERROR','ERROR','INVALID','OFFLINE',
    'UNAVAILABLE','DISCONNECTED','NOT_INSTALLED','REMOVED'
  ]){
    const x=observed(25,status);
    assert.equal(waterLevelCm(x),null,status);
    assert.notEqual(level(x),'SAFE',status);
    assert.equal(risk(x),'UNKNOWN',status);
  }
});

test('reporting LOW cannot downplay measured WARNING or DANGER',()=>{
  assert.equal(risk(observed(16.5,'SAFE','LOW')),'HIGH');
  assert.equal(risk(observed(13,'SAFE','LOW')),'CRITICAL');
  assert.equal(risk(observed(13,'UNKNOWN','MODERATE')),'CRITICAL');
  assert.equal(risk(observed(16.5,'UNKNOWN','CRITICAL')),'CRITICAL');
});

test('expired LOW is unverified, but known HIGH alert is preserved',()=>{
  const old=Date.now()-60000;
  assert.equal(isStale(observed(25,'SAFE','LOW',old)),true);
  assert.equal(risk(observed(25,'SAFE','LOW',old)),'UNKNOWN');
  assert.equal(risk(observed(25,'SAFE','HIGH',old)),'HIGH');
});

test('offline virtual recovery planner requires installation-bounded evidence',()=>{
  const now=Date.now();
  const previous={topic:'water',phase:'DANGER',sourceAt:now-3000};
  for(const gap of [25.01,26,400]){
    const x=planVirtualWaterSnapshot({
      live:observed(gap,'SAFE','LOW',now-1000),
      previous,now
    });
    assert.equal(x.accepted,false,String(gap));
    assert.equal(x.alert,null,String(gap));
  }
  const actual=planVirtualWaterSnapshot({
    live:observed(25,'SAFE','LOW',now-1000),
    previous,now
  });
  assert.equal(actual.accepted,true);
  assert.equal(actual.alert?.phase,'SAFE');
});

test('zero air gap cannot authorize a SAFE recovery without calibration evidence',()=>{
  const now=Date.now();
  const zero=observed(0,'SAFE','LOW',now-1000);
  assert.equal(waterLevelCm(zero),null);
  assert.equal(level(zero),'UNKNOWN');
  assert.equal(risk(zero),'UNKNOWN');
  const proposed=planVirtualWaterSnapshot({
    live:zero,previous:{topic:'water',phase:'DANGER',sourceAt:now-3000},now
  });
  assert.equal(proposed.accepted,false);
  assert.equal(proposed.alert,null);
});

test('a zero reading must not erase an independently reported DANGER label',()=>{
  const now=Date.now();
  const zeroDanger=observed(0,'DANGER','CRITICAL',now-1000);
  assert.equal(waterLevelCm(zeroDanger),null);
  assert.equal(level(zeroDanger),'DANGER');
  assert.equal(risk(zeroDanger),'CRITICAL');
  // A categorical hazard may remain visible, but a numeric zero alone
  // cannot authorize an automated recovery or physical gate conclusion.
  const proposed=planVirtualWaterSnapshot({
    live:zeroDanger,previous:{topic:'water',phase:'DANGER',sourceAt:now-3000},now
  });
  assert.equal(proposed.accepted,false);
  assert.equal(proposed.alert,null);
});
