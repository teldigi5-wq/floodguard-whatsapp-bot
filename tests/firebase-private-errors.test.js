'use strict';
// Mock-only private-error redaction tests. Never contact Firebase production.
const test=require('node:test');
const assert=require('node:assert/strict');
const {getLive,streamLive,CHANNELS}=require('../src/firebase');

const SECRET='synthetic-auth-token-DO-NOT-LOG';
const SENSITIVE='https://fictional.invalid/private.json?auth='+SECRET;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntil(fn,ms=600) {
  const end=Date.now()+ms;
  while(!fn()&&Date.now()<end) await pause(10);
  assert.ok(fn(),'synthetic firebase error event timed out');
}

test('REST fetch rejection never exports private URL or token to callers',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('NetworkError '+SENSITIVE);};
  try{
    await assert.rejects(getLive(),e=>
      /Firebase telemetry request failed/i.test(e.message) &&
      !e.message.includes(SECRET)&&!e.message.includes(SENSITIVE));
  }finally{globalThis.fetch=previous;}
});

test('REST body stream rejection never exports underlying transport details',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(new ReadableStream({
    start(controller){controller.error(Error('TCP_RESET '+SENSITIVE));}
  }),{status:200});
  try{
    await assert.rejects(getLive(),e=>
      /Firebase telemetry response stream failed/i.test(e.message) &&
      !e.message.includes(SECRET)&&!e.message.includes(SENSITIVE));
  }finally{globalThis.fetch=previous;}
});

test('malformed REST JSON has a fixed private-data-safe diagnostic',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response('{"private":"'+SECRET+'"', {status:200});
  try{
    await assert.rejects(getLive(),e=>
      /Firebase telemetry response invalid JSON/i.test(e.message) &&
      !e.message.includes(SECRET));
  }finally{globalThis.fetch=previous;}
});

test('SSE fetch failures emit redacted errors without request URL or credentials',async()=>{
  const previous=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async(url,opts)=>{
    const pathname=new URL(url).pathname;
    assert.ok(CHANNELS.some(([,node])=>pathname.endsWith('/floodguard/live/'+node+'.json')));
    assert.equal(opts.redirect,'error');
    requests++;
    throw new Error('socket failed '+SENSITIVE);
  };
  const stream=streamLive();
  const events=[];
  stream.on('error',e=>events.push(e.message));
  try {
    await waitUntil(()=>events.length>=CHANNELS.length);
    assert.equal(requests,CHANNELS.length,'exact public channels only');
    for(const message of events) {
      assert.match(message,/Firebase telemetry transport failed/i);
      assert.doesNotMatch(message,/fictional.invalid|private.json|synthetic-auth-token|auth=/);
    }
  }finally{stream.stop();globalThis.fetch=previous;}
});

test('SSE reader failure after root PUT does not expose raw socket diagnostics',async()=>{
  const previous=globalThis.fetch;
  let waterErrors=0;
  const encoder=new TextEncoder();
  globalThis.fetch=async(url,opts)=>{
    const pathname=new URL(url).pathname;
    const match=CHANNELS.find(([,node])=>pathname.endsWith('/floodguard/live/'+node+'.json'));
    assert.ok(match);
    const [key]=match;
    return new Response(new ReadableStream({
      start(controller){
        controller.enqueue(encoder.encode('event: put\n' +
          'data: '+JSON.stringify({path:'/',data:key==='water'?
            {distanceCm:20,status:'SAFE'}:null})+'\n\n'));
        if(key==='water') {
          queueMicrotask(()=>controller.error(Error('read failure '+SENSITIVE)));
        }else {
          opts.signal.addEventListener('abort',()=>{try{controller.close();}catch{}},{once:true});
        }
      }
    }),{status:200});
  };
  const stream=streamLive();
  stream.on('error',e=>{
    assert.doesNotMatch(e.message,/synthetic-auth-token|auth=|fictional.invalid/);
    if(/response stream failed/i.test(e.message))waterErrors++;
  });
  try{
    await waitUntil(()=>waterErrors>=1);
  }finally{stream.stop();globalThis.fetch=previous;}
});
