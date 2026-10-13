'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PUBLIC_PATHS,getLive,applyEvent}=require('../src/firebase');

test('only individual approved Firebase children are readable',()=>{
 assert.deepEqual(PUBLIC_PATHS,['water','rain','gate','alarm','devices','system',
   'esp8266/connection','esp8266/rssi','esp8266/status']);
 for(const path of ['/floodguard/live','esp8266','esp8266/ip','esp8266/wifi'])
   assert.ok(!PUBLIC_PATHS.includes(path));
});
test('getLive merges individual approved child snapshots',async()=>{
 const original=global.fetch,requested=[];
 global.fetch=async url=>{
   requested.push(url);
   return {ok:true,json:async()=>url.includes('/water.json')?{levelCm:9.65}:
     url.includes('/esp8266/status.json')?'ONLINE':null};
 };
 try{
   const tree=await getLive();
   assert.equal(tree.water.levelCm,9.65);
   assert.equal(tree.esp8266.status,'ONLINE');
   assert.equal(requested.length,PUBLIC_PATHS.length);
   for(const url of requested){
     assert.ok(PUBLIC_PATHS.some(path=>url.includes('/floodguard/live/'+path+'.json')));
     assert.ok(!url.includes('/floodguard/live.json'));
     assert.ok(!url.includes('/esp8266.json'));
   }
 } finally{global.fetch=original;}
});
test('independent SSE put and patch events preserve telemetry',()=>{
 const root={};
 applyEvent(root,'water','put',{path:'/',data:{levelCm:9.65,distanceCm:15.35}});
 applyEvent(root,'water','patch',{path:'/',data:{distanceCm:14}});
 applyEvent(root,'gate','put',{path:'/',data:{angle:0,status:'CLOSED'}});
 applyEvent(root,'gate','patch',{path:'/',data:{angle:90,status:'OPEN'}});
 applyEvent(root,'esp8266/status','put',{path:'/',data:'ONLINE'});
 assert.equal(root.water.levelCm,9.65);
 assert.equal(root.water.distanceCm,14);
 assert.equal(root.gate.status,'OPEN');
 assert.equal(root.esp8266.status,'ONLINE');
 assert.ok(!Object.hasOwn(root.esp8266,'ip'));
 applyEvent(root,'water','put',{path:'/distanceCm',data:null});
 assert.ok(!Object.hasOwn(root.water,'distanceCm'));
});
test('malformed, private and prototype-polluting paths are rejected',()=>{
 assert.throws(()=>applyEvent({},'esp8266','put',{path:'/',data:{}}),/Private/);
 assert.throws(()=>applyEvent({},'esp8266/wifi','put',{path:'/',data:'private'}),/Private/);
 assert.throws(()=>applyEvent({},'water','patch',{path:'/',data:'x'}),/Malformed/);
 assert.throws(()=>applyEvent({},'water','put',{path:'/__proto__',data:'x'}),/Unsafe/);
 assert.throws(()=>applyEvent({},'water','put',{path:'relative',data:10}),/Invalid/);
});
