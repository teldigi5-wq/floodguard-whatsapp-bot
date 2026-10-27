'use strict';
// Offline SSE liveness tests. No production Firebase, credentials, or hardware.
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {streamLive,CHANNELS}=require('../src/firebase');

const enc=new TextEncoder();
const makeFrame=(type,data)=>enc.encode('event: '+type+'\n'+'data: '+JSON.stringify(data)+'\n\n');
const root=key=>makeFrame('put',{path:'/',data:
  key==='water'?{distanceCm:21,status:'SAFE'}:
  key==='system'?{lastUpdate:Date.now()}:null});
const danger=makeFrame('put',{path:'/',data:{distanceCm:13,status:'DANGER'}});
const keepalive=makeFrame('keep-alive',null);
const comment=enc.encode(': non-semantic chatter\n\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=2600) {
  const end=Date.now()+timeout;
  while(!predicate()&&Date.now()<end) await sleep(12);
  assert.ok(predicate(),'synthetic timeout: '+label);
}
function childKey(url) {
  const pathname=new URL(url).pathname;
  const child=CHANNELS.find(([,name])=>
    pathname.endsWith('/floodguard/live/'+name+'.json'));
  assert.ok(child,'only allowlisted public child nodes allowed');
  return child[0];
}
function makeResponse(key,signal,intervals,{initial,periodic}={}) {
  let timer=null;
  const body=new ReadableStream({
    start(controller) {
      controller.enqueue(initial??root(key));
      if(periodic) timer=setInterval(()=>{
        try {controller.enqueue(periodic);} catch {clearInterval(timer);}
      },23);
      if(timer) intervals.add(timer);
      signal.addEventListener('abort',()=>{
        if(timer){clearInterval(timer);intervals.delete(timer);}
        try{controller.close();}catch{}
      },{once:true});
    }
  });
  return new Response(body,{status:200,headers:{'Content-Type':'text/event-stream'}});
}
function cleanup(stream,oldFetch,intervals) {
  stream.stop();
  globalThis.fetch=oldFetch;
  for(const timer of intervals) clearInterval(timer);
  intervals.clear();
}

test('silent water SSE after initial snapshot becomes an outage, then reacquires a fresh root',async()=>{
  const old=globalThis.fetch,intervals=new Set();
  let waterAttempts=0;
  globalThis.fetch=async(url,opts)=>{
    assert.equal(opts.redirect,'error');
    const key=childKey(url);
    if(key==='water') {
      waterAttempts++;
      return makeResponse(key,opts.signal,intervals,{
        initial:waterAttempts===1?root('water'):danger,
        periodic:waterAttempts===1?null:keepalive
      });
    }
    return makeResponse(key,opts.signal,intervals,{periodic:keepalive});
  };
  const stream=streamLive({idleTimeoutMs:280});
  const errors=[],frames=[];
  let connected=0;
  stream.on('error',e=>errors.push(e.message));
  stream.on('live',data=>frames.push(data));
  stream.on('connected',()=>connected++);
  try {
    await until(()=>frames.length>=1,'initial complete synthetic snapshot');
    assert.equal(frames[0].water.distanceCm,21);
    await until(()=>errors.some(e=>/idle.*timed out/i.test(e)),'silent water stream outage');
    assert.equal(waterAttempts,1,'new connection must follow reconnect backoff');
    assert.ok(errors.every(e=>!e.includes('auth=')&&!e.includes('token')));
    await until(()=>waterAttempts===2&&connected>=2&&
      frames.some(f=>f.water.distanceCm===13),'reconnected full DANGER root',2800);
    assert.equal(frames.at(-1).water.status,'DANGER');
  } finally {cleanup(stream,old,intervals);}
});

test('legitimate Firebase keep-alive frames keep stable data connected beyond the idle threshold',async()=>{
  const old=globalThis.fetch,intervals=new Set();
  globalThis.fetch=async(url,opts)=>makeResponse(childKey(url),opts.signal,intervals,{periodic:keepalive});
  const stream=streamLive({idleTimeoutMs:250});
  const errors=[],frames=[];
  stream.on('error',e=>errors.push(e.message));
  stream.on('live',v=>frames.push(v));
  try {
    await until(()=>frames.length>=1,'initial baseline');
    await sleep(555); // several watchdog windows, unchanged sensor readings
    assert.deepEqual(errors,[],'keep-alive events must prevent a false reconnect');
    assert.equal(frames[0].water.status,'SAFE');
  }finally{cleanup(stream,old,intervals);}
});

test('unrecognized comment-only chatter does not indefinitely mask stale telemetry',async()=>{
  const old=globalThis.fetch,intervals=new Set();
  globalThis.fetch=async(url,opts)=>{
    const key=childKey(url);
    return makeResponse(key,opts.signal,intervals,{
      periodic:key==='water'?comment:keepalive
    });
  };
  const stream=streamLive({idleTimeoutMs:280});
  const errors=[];
  stream.on('error',e=>errors.push(e.message));
  stream.on('live',()=>{});
  try {
    await until(()=>errors.some(e=>/idle.*timed out/i.test(e)),
      'comment-only water stream must time out');
    assert.equal(errors.filter(e=>/idle.*timed out/i.test(e)).length,1);
  }finally{cleanup(stream,old,intervals);}
});

test('invalid idle timeouts are rejected before watchers start',()=>{
  for(const idleTimeoutMs of [0,-3,1.5,NaN,Infinity,300001,'100']) {
    assert.throws(()=>streamLive({idleTimeoutMs}),/idle|timeout|invalid/i);
  }
});

test('deliberate stop removes long idle-watchdog timers from actual Node process',()=>{
  const modulePath=path.resolve(__dirname,'../src/firebase.js');
  const source=[
    "'use strict';",
    "const {streamLive,CHANNELS}=require(process.argv[1]);",
    "const enc=new TextEncoder();",
    "globalThis.fetch=async(url,opts)=>new Response(new ReadableStream({start(controller){",
    "controller.enqueue(enc.encode('event: put\\ndata: '+JSON.stringify({path:'/',data:null})+'\\n\\n'));",
    "opts.signal.addEventListener('abort',()=>{try{controller.close();}catch{}},{once:true});",
    "}}),{status:200});",
    "const watcher=streamLive({idleTimeoutMs:2000});",
    "watcher.on('error',()=>{});",
    "setTimeout(()=>watcher.stop(),90);"
  ].join('\n');
  const result=spawnSync(process.execPath,['-e',source,modulePath],{
    encoding:'utf8',timeout:900,maxBuffer:65536
  });
  assert.equal(result.error,undefined,'stopped watcher must not retain a 2-second timeout');
  assert.equal(result.status,0,result.stderr);
});
