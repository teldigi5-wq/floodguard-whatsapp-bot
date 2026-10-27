'use strict';
// All HTTP and SSE streams here are synthetic. Never contact Firebase production.
const test = require('node:test');
const assert = require('node:assert/strict');
const { streamLive, CHANNELS } = require('../src/firebase');
const encoder = new TextEncoder();
const initial = (key) => encoder.encode('event: put\n' +
  'data: ' + JSON.stringify({path:'/',data:key==='water'
    ? {distanceCm:14,status:'DANGER'} : key==='system' ? {lastUpdate:Date.now()} : null}) + '\n\n');
function matched(url) {
  const pathname = new URL(url).pathname;
  const entry = CHANNELS.find(([,child]) =>
    pathname.endsWith('/floodguard/live/' + child + '.json'));
  assert.ok(entry, 'never read a private parent or child');
  return entry[0];
}
function deadline(ms, label) {
  let timer;
  const promise = new Promise((_,reject) => {
    timer=setTimeout(()=>reject(new Error('Synthetic timeout: '+label)),ms);
  });
  return {promise,clear:()=>clearTimeout(timer)};
}
function syntheticStream(key,signal,{patchOnly=false}={}) {
  return new Response(new ReadableStream({
    start(controller) {
      if (patchOnly && key==='water') {
        controller.enqueue(encoder.encode('event: patch\ndata: {"path":"/status","data":"SAFE"}\n\n'));
      } else controller.enqueue(initial(key));
      signal.addEventListener('abort',()=>{try{controller.close();}catch{}},{once:true});
    }
  }), {status:200,headers:{'Content-Type':'text/event-stream'}});
}

test('a child with stalled HTTP handshake times out with redacted error and can reconnect',async()=>{
  const previous=globalThis.fetch;
  let waterAttempts=0;
  const optionsSeen=[];
  globalThis.fetch=async(url,opts)=>{
    const key=matched(url);
    assert.equal(opts.redirect,'error');
    optionsSeen.push(key);
    if(key==='water' && ++waterAttempts===1) {
      return new Promise((_,reject)=>{
        opts.signal.addEventListener('abort',()=>reject(new Error('synthetic-url-auth=private-token')),{once:true});
      });
    }
    return syntheticStream(key,opts.signal);
  };
  const stream=streamLive({initialSnapshotTimeoutMs:90});
  const errors=[],snapshots=[];
  stream.on('error',e=>errors.push(e.message));
  stream.on('live',live=>snapshots.push(live));
  const t=deadline(2500,'initial HTTP handshake timeout');
  try {
    await Promise.race([
      (async()=>{
        while(!errors.length) await new Promise(resolve=>setTimeout(resolve,10));
      })(),t.promise
    ]);
    assert.match(errors[0],/initial snapshot timed out/i);
    assert.doesNotMatch(errors.join('\n'),/auth=|private-token/);
    assert.equal(waterAttempts,1);
    assert.deepEqual(new Set(optionsSeen), new Set(CHANNELS.map(([key])=>key)));
    assert.equal(snapshots.length,0,'partial composite must not be published');
  } finally {
    t.clear();stream.stop();globalThis.fetch=previous;
  }
});

test('a connected HTTP stream with only partial PATCH never satisfies initial snapshot deadline',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>syntheticStream(matched(url),opts.signal,{patchOnly:true});
  const stream=streamLive({initialSnapshotTimeoutMs:90});
  const errors=[],snapshots=[];
  stream.on('error',e=>errors.push(e.message));
  stream.on('live',live=>snapshots.push(live));
  const t=deadline(1500,'missing initial root PUT');
  try {
    await Promise.race([(async()=>{
      while(!errors.length) await new Promise(resolve=>setTimeout(resolve,10));
    })(),t.promise]);
    assert.match(errors[0],/initial snapshot timed out/i);
    assert.equal(snapshots.length,0);
  } finally {t.clear();stream.stop();globalThis.fetch=previous;}
});

test('fresh root PUT cancels initial deadline and retains healthy long-running SSE',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>syntheticStream(matched(url),opts.signal);
  const stream=streamLive({initialSnapshotTimeoutMs:90});
  const errors=[];
  stream.on('error',e=>errors.push(e.message));
  const t=deadline(1300,'healthy SSE first snapshot');
  try {
    const live=await Promise.race([new Promise(resolve=>stream.once('live',resolve)),t.promise]);
    assert.equal(live.water.distanceCm,14);
    await new Promise(resolve=>setTimeout(resolve,160));
    assert.deepEqual(errors,[],'initial deadline must be cleared after root PUT');
  } finally {t.clear();stream.stop();globalThis.fetch=previous;}
});

test('invalid watchdog settings fail before any background watcher starts',()=>{
  for(const n of [0,-1,1.5,NaN,Infinity,60001,'90']) {
    assert.throws(()=>streamLive({initialSnapshotTimeoutMs:n}),/initial snapshot|timeout|invalid/i);
  }
});
