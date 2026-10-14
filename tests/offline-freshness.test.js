'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

// Isolate bot persistent state. No EC2, WhatsApp or real Firebase is accessed.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'floodguard-offline-'));
process.env.DATA_PATH=tmp;
const { isStale, fieldTimeMs, commandReply, processLiveChange }=require('../src/floodguard');
const { getState }=require('../src/store');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const snapshot=(time)=>({
  system:{lastUpdate:time,overallRisk:'HIGH'},
  water:{distanceCm:11,levelCm:14,status:'DANGER'},
  gate:{status:'COUNTDOWN',countdownSeconds:5,angle:0},
  alarm:{active:true,type:'WATER'},
  devices:{arduino:'ONLINE',rainGauge:'NOT_INSTALLED',ultrasonic:'ONLINE'},
  esp8266:{status:'ONLINE',connection:'CONNECTED',rssi:-62}
});

test('accept epoch seconds, epoch milliseconds and ISO timestamps',()=>{
 const now=Date.now();
 const ms=now-4000;
 assert.equal(fieldTimeMs(snapshot(ms),now),ms);
 const seconds=Math.floor(ms/1000);
 assert.equal(fieldTimeMs(snapshot(seconds),now),seconds*1000);
 assert.equal(fieldTimeMs(snapshot(new Date(ms).toISOString()),now),ms);
 assert.equal(isStale(snapshot(ms)),false);
 assert.equal(isStale(snapshot(seconds)),false);
});

test('old, missing, invalid and forward-dated field clocks are not live',()=>{
 const now=Date.now();
 for(const bad of [null,undefined,0,-1,'not a date',Infinity,now+60000,now-3600000]){
   assert.equal(isStale(snapshot(bad)),true,'Invalid time was treated as live: '+String(bad));
 }
 assert.equal(fieldTimeMs(snapshot(now+60000),now),null);
 assert.equal(fieldTimeMs(snapshot(now-3600000),now),now-3600000);
});

test('offline WhatsApp commands disclose historical rather than current data',async()=>{
 const old=snapshot(Date.now()-60*60*1000);
 for(const cmd of ['stats','water','risk','gate','devices','rain','network','emergency']){
   const result=await commandReply('test@s.whatsapp.net',cmd,async()=>old);
   assert.match(result,/STALE/,cmd+' omitted freshness warning');
   assert.doesNotMatch(result,cmd==='stats'?/\*FLOODGUARD LIVE STATS\*/:/\bData: LIVE\b/,cmd);
 }
 const stats=await commandReply('test@s.whatsapp.net','stats',async()=>old);
 assert.match(stats,/LAST RECORDED STATS/);
 const gate=await commandReply('test@s.whatsapp.net','gate',async()=>old);
 assert.match(gate,/NOT LIVE \(stored countdown\)/);
 const devices=await commandReply('test@s.whatsapp.net','devices',async()=>old);
 assert.match(devices,/LAST REPORTED DEVICE HEALTH/);
 const emergency=await commandReply('test@s.whatsapp.net','emergency',async()=>old);
 assert.match(emergency,/LAST RECORDED ALARM STATUS/);
});

test('stale or future-dated snapshots never emit automatic gate or flood alerts',async()=>{
 const sends=[];
 const sock={sendMessage:async(...args)=>{sends.push(args)}};
 await processLiveChange(sock,snapshot(Date.now()-3600000));
 await processLiveChange(sock,snapshot(Date.now()+60000));
 assert.equal(sends.length,0);
 assert.equal(getState().dataStale,true);
 assert.notEqual(getState().initialized,true);
});

test('lack of source data is reported as unavailable, not safe',async()=>{
 const reply=await commandReply('test@s.whatsapp.net','stats',async()=>null);
 assert.match(reply,/NOT AVAILABLE/);
 assert.doesNotMatch(reply,/Water: \*SAFE\*/);
});
