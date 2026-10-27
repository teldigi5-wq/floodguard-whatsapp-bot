'use strict';

// Isolated, in-memory synthetic telemetry ingress contract.
// NOT used by bot.js or live Firebase/WhatsApp. No I/O or networking.
// A bounded timer exists only while a fake consumer callback is in flight.
// A full queue is an explicit unrecoverable fault, not a silent drop.
const PHASES = Object.freeze({
  water: new Set(['SAFE','WARNING','DANGER']),
  gate: new Set(['CLOSED','COUNTDOWN','OPEN']),
  sensor: new Set(['SAFE','SENSOR_ERROR'])
});
const MAX_AGE_MS = 15000;
const MAX_LEAD_MS = 5000;
function invalid() { throw Error('Virtual telemetry ingress INVALID observation or configuration'); }
function fail(code) { throw Error('Virtual telemetry ingress ' + code); }

function createVirtualTelemetryScheduler({
  capacity=32,now=Date.now,consumer,consumerTimeoutMs=3000
}={}) {
  if (!Number.isSafeInteger(capacity) || capacity<1 || capacity>256 ||
      !Number.isSafeInteger(consumerTimeoutMs) ||
      consumerTimeoutMs<25 || consumerTimeoutMs>10000 ||
      typeof now!=='function' || typeof consumer!=='function') invalid();

  const pending=[];
  const lastAccepted = new Map();
  let draining=false;
  let fault=null;
  const counters={processed:0,coalesced:0,duplicates:0,older:0,
    rejectedOverflow:0,expired:0,quarantined:0,timedOut:0};

  function normalize(value) {
    // Reject arbitrary payloads so account identifiers, secrets or untrusted
    // object references cannot reach queue diagnostics or synthetic consumer.
    if(!value || Array.isArray(value) || typeof value!=='object' ||
       (Object.getPrototypeOf(value)!==Object.prototype &&
        Object.getPrototypeOf(value)!==null) ||
       Object.keys(value).length!==3 ||
       !Object.hasOwn(value,'topic') || !Object.hasOwn(value,'phase') ||
       !Object.hasOwn(value,'sourceAt')) invalid();
    const {topic,phase,sourceAt}=value;
    if(typeof topic!=='string' || !Object.hasOwn(PHASES,topic) ||
       !PHASES[topic].has(phase) ||
       !Number.isSafeInteger(sourceAt) || sourceAt < Date.UTC(2000,0,1)) invalid();
    const current=now();
    if(!Number.isSafeInteger(current) || sourceAt > current+MAX_LEAD_MS ||
       current-sourceAt > MAX_AGE_MS) invalid();
    return Object.freeze({topic,phase,sourceAt});
  }
  function offer(observation) {
    if (fault) fail(fault);
    const next=normalize(observation);
    const previous=lastAccepted.get(next.topic);
    if(previous) {
      if(next.sourceAt<previous.sourceAt) {
        counters.older++;
        return {kind:'older'};
      }
      if(next.sourceAt===previous.sourceAt) {
        if(next.phase!==previous.phase) {
          fault='CONFLICT';
          fail(fault);
        }
        counters.duplicates++;
        return {kind:'duplicate'};
      }
    }
    const last=pending.at(-1);
    if(last && last.topic===next.topic && last.phase===next.phase) {
      pending[pending.length-1]=next;
      lastAccepted.set(next.topic,next);
      counters.coalesced++;
      return {kind:'coalesced'};
    }
    if(pending.length>=capacity) {
      counters.rejectedOverflow++;
      fault='OVERFLOW';
      fail(fault);
    }
    pending.push(next);
    lastAccepted.set(next.topic,next);
    return {kind:'queued'};
  }
  async function drain() {
    if(fault) fail(fault);
    if(draining) fail('BUSY');
    draining=true;
    let completed=0;
    try {
      while(pending.length) {
        if(fault) fail(fault);
        const entry=pending[0];
        const age=now()-entry.sourceAt;
        if(age > MAX_AGE_MS) {
          pending.shift();
          counters.expired++;
          fault='EXPIRED';
          fail(fault);
        }
        // Remove before invoking the fake consumer so concurrent synthetic
        // observations can queue while this call awaits. Once the callback
        // starts, its side effects are not undoable or guaranteed.
        pending.shift();
        const controller=new AbortController();
        const expiredToken=Symbol('timeout');
        let timer;
        let result;
        try {
          const deadline=new Promise(resolve=>{
            timer=setTimeout(()=>resolve(expiredToken),consumerTimeoutMs);
          });
          // Invoke the injected fake consumer with best-effort cancellation.
          // Never reuse a late completion to clear a timeout or fault.
          result=await Promise.race([
            Promise.resolve(consumer(entry,{signal:controller.signal})).then(()=>null),
            deadline
          ]);
        } catch {
          controller.abort();
          counters.quarantined++;
          fault='CONSUMER_FAILURE';
          fail(fault); // Never export consumer-supplied errors or retry.
        } finally {
          if(timer!==undefined) clearTimeout(timer);
        }
        if(result===expiredToken) {
          controller.abort();
          counters.quarantined++;
          counters.timedOut++;
          fault='CONSUMER_TIMEOUT';
          fail(fault);
        }
        counters.processed++;
        completed++;
      }
      return {processed:completed,pending:pending.length};
    } finally {
      draining=false;
    }
  }
  function status() {
    return Object.freeze({...counters,pending:pending.length,
      inFlight:draining,faulted:fault!==null,faultCode:fault});
  }
  return Object.freeze({offer,drain,status});
}
module.exports={createVirtualTelemetryScheduler};
