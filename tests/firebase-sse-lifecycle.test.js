'use strict';
// Synthetic transport lifecycle tests. No production Firebase requests.
const test=require('node:test');
const assert=require('node:assert/strict');
const {streamLive, CHANNELS}=require('../src/firebase');

function timeout(ms, label) {
  let timer;
  const promise=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Synthetic '+label+' timed out')),ms);
  });
  return {promise,clear:()=>clearTimeout(timer)};
}
function frame(child) {
  const value=child==='water' ? {distanceCm:14,status:'WARNING'} :
    child==='system' ? {lastUpdate:Date.now()} : null;
  return new TextEncoder().encode('event: put\n' +
    'data: '+JSON.stringify({path:'/',data:value})+'\n\n');
}

test('unexpected clean EOF of a child SSE stream reports a redacted error, not permanent connected health',async()=>{
  const original=globalThis.fetch;
  let endWater=null;
  const opened=[];
  globalThis.fetch=async(url,options)=>{
    const p=new URL(url).pathname;
    const child=CHANNELS.find(([,childPath])=>p.endsWith('/floodguard/live/'+childPath+'.json'));
    assert.ok(child,'only approved public child paths are allowed');
    assert.equal(options.redirect,'error');
    opened.push(child[0]);
    const body=new ReadableStream({
      start(controller) {
        controller.enqueue(frame(child[0]));
        if(child[0]==='water') endWater=()=>controller.close();
        options.signal.addEventListener('abort',()=>{try{controller.close();}catch{}},{once:true});
      }
    });
    return new Response(body,{status:200,headers:{'Content-Type':'text/event-stream'}});
  };
  const stream=streamLive(), deadline=timeout(1500,'first full stream');
  let connected=0;
  stream.on('connected',()=>{connected++;});
  try{
    const live=await Promise.race([
      new Promise((resolve,reject)=>{stream.once('live',resolve);stream.once('error',reject);}),
      deadline.promise
    ]);
    assert.equal(live.water.distanceCm,14);
    assert.equal(connected,1);
    assert.equal(opened.length,CHANNELS.length);
    assert.equal(typeof endWater,'function');
    const outage=timeout(500,'EOF error notification');
    try {
      const failure=new Promise(resolve=>stream.once('error',resolve));
      endWater(); // Simulated remote socket closes without explicit HTTP error.
      const error=await Promise.race([failure,outage.promise]);
      assert.match(error.message,/stream.*(end|clos)|unexpected.*(end|clos)/i);
      assert.ok(!error.message.includes('auth='));
    }finally{outage.clear();}
  }finally{
    deadline.clear();
    stream.stop();
    globalThis.fetch=original;
  }
});

test('deliberate stop never reports a false remote-outage error',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const p=new URL(url).pathname;
    const child=CHANNELS.find(([,s])=>p.endsWith('/floodguard/live/'+s+'.json'));
    assert.ok(child);
    return new Response(new ReadableStream({
      start(controller){
        controller.enqueue(frame(child[0]));
        options.signal.addEventListener('abort',()=>{try{controller.close();}catch{}},{once:true});
      }
    }),{status:200});
  };
  const s=streamLive();
  const errors=[];
  s.on('error',e=>errors.push(e.message));
  const deadline=timeout(1500,'stop test startup');
  try {
    await Promise.race([new Promise(resolve=>s.once('live',resolve)),deadline.promise]);
    s.stop();
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(errors,[]);
  }finally{
    deadline.clear();
    s.stop();
    globalThis.fetch=original;
  }
});
