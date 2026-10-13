'use strict';
const { EventEmitter } = require('events');

// Public RTDB children. Never read /live or /esp8266 parent.
const PUBLIC_PATHS = Object.freeze(['water','rain','gate','alarm','devices','system',
  'esp8266/connection','esp8266/rssi','esp8266/status']);
const CORE = PUBLIC_PATHS.slice(0,6);
const BASE=(process.env.FIREBASE_DATABASE_URL ||
 'https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/,'');
const AUTH=process.env.FIREBASE_AUTH||'';
const unsafe=new Set(['__proto__','constructor','prototype']);
function url(path) {
 if(!PUBLIC_PATHS.includes(path)) throw new Error('Private Firebase path');
 const endpoint=BASE+'/floodguard/live/'+path+'.json';
 return AUTH?endpoint+'?auth='+encodeURIComponent(AUTH):endpoint;
}
function segments(path) {
 if(typeof path!=='string'||!path.startsWith('/')) throw new Error('Invalid Firebase path');
 const parts=path.split('/').filter(Boolean);
 if(parts.some(k=>unsafe.has(k))) throw new Error('Unsafe Firebase path');
 return parts;
}
function setAt(root,parts,value) {
 if(!parts.length||parts.some(k=>unsafe.has(k))) throw new Error('Unsafe field');
 let obj=root;
 for(const key of parts.slice(0,-1)) {
   if(!obj[key]||typeof obj[key]!=='object'||Array.isArray(obj[key]))obj[key]={};
   obj=obj[key];
 }
 if(value===null)delete obj[parts[parts.length-1]];
 else obj[parts[parts.length-1]]=value;
}
function applyEvent(root,branch,kind,packet) {
 if(!PUBLIC_PATHS.includes(branch))throw new Error('Private Firebase path');
 if(!packet||typeof packet!=='object')throw new Error('Malformed Firebase event');
 const target=branch.split('/').concat(segments(packet.path));
 if(kind==='put')setAt(root,target,packet.data);
 else if(kind==='patch') {
   if(!packet.data||typeof packet.data!=='object'||Array.isArray(packet.data))
     throw new Error('Malformed Firebase patch');
   for(const [key,value] of Object.entries(packet.data))
     setAt(root,target.concat(segments('/'+key)),value);
 }else throw new Error('Unsupported Firebase event');
}
async function getLive() {
 const records=await Promise.all(PUBLIC_PATHS.map(async path=>{
   const response=await fetch(url(path),{headers:{'Cache-Control':'no-cache'}});
   if(!response.ok)throw new Error('Firebase public telemetry '+path+' HTTP '+response.status);
   return [path,await response.json()];
 }));
 const state={};
 for(const [path,value] of records)setAt(state,path.split('/'),value);
 return Object.keys(state).length?state:null;
}
function streamLive() {
 const emitter=new EventEmitter();
 const state={},seen=new Set(),online=new Set();
 const controllers=new Map(),waits=new Map();
 let stopped=false,flush=null,connected=false;
 function notify() {
   const ready=CORE.every(p=>online.has(p));
   if(ready&&!connected){connected=true;emitter.emit('connected');}
   if(!ready)connected=false;
 }
 function schedule() {
   if(stopped||!CORE.every(p=>seen.has(p)))return;
   clearTimeout(flush);
   flush=setTimeout(()=>{
     flush=null;
     if(!stopped)emitter.emit('live',JSON.parse(JSON.stringify(state)));
   },120);
 }
 function delay(ms) {
   return new Promise(resolve=>{
     const t=setTimeout(()=>{waits.delete(t);resolve();},ms);
     waits.set(t,resolve);
   });
 }
 async function connect(path) {
   let retry=1000;
   while(!stopped) {
     const controller=new AbortController();
     controllers.set(path,controller);
     try {
       const response=await fetch(url(path),{
         headers:{Accept:'text/event-stream','Cache-Control':'no-cache'},
         signal:controller.signal
       });
       if(!response.ok||!response.body)throw new Error('Stream HTTP '+response.status);
       online.add(path);notify();retry=1000;
       const reader=response.body.getReader(),decoder=new TextDecoder();
       let buffer='';
       while(!stopped) {
         const item=await reader.read();
         if(item.done)break;
         buffer+=decoder.decode(item.value,{stream:true});
         // CRLF can be split across network chunks; normalize the full buffer.
         buffer=buffer.replace(/\r\n/g,'\n');
         if(buffer.length>2000000)throw new Error('Oversized SSE event');
         let end;
         while((end=buffer.indexOf('\n\n'))>=0) {
           const block=buffer.slice(0,end);
           buffer=buffer.slice(end+2);
           let name='';const data=[];
           for(const line of block.split(/\r?\n/)) {
             if(line.startsWith('event:'))name=line.slice(6).trim();
             if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
           }
           if(name==='put'||name==='patch'){
             applyEvent(state,path,name,JSON.parse(data.join('\n')));
             seen.add(path);schedule();
           }else if(name==='keep-alive')emitter.emit('keepalive');
           else if(name==='cancel'||name==='auth_revoked')throw new Error('Access revoked at '+path);
         }
       }
     } catch(error) {
       if(!stopped)emitter.emit('error',new Error('Firebase '+path+': '+error.message));
     } finally {
       online.delete(path);notify();controllers.delete(path);
     }
     if(!stopped){await delay(retry);retry=Math.min(retry*2,30000);}
   }
 }
 for(const path of PUBLIC_PATHS)void connect(path);
 emitter.stop=()=>{
   stopped=true;clearTimeout(flush);
   for(const controller of controllers.values())controller.abort();
   for(const [t,resolve] of waits){clearTimeout(t);resolve();}
   waits.clear();
 };
 return emitter;
}
module.exports={PUBLIC_PATHS,getLive,streamLive,applyEvent};
