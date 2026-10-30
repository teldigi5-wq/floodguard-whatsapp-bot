'use strict';

// A pure, offline-only planning boundary. Not imported by bot.js or by the
// production alert dispatcher. Never initiates network, QR or WhatsApp calls.
const { fieldTimeMs, level, waterLevelCm } = require('./floodguard');
const ACCEPTED = new Set(['SAFE', 'WARNING', 'DANGER']);
const MAX_SOURCE_AGE_MS = 15000;

function refusal(reason) {
  // Fixed codes only. Do not reflect untrusted sensor values in diagnostics.
  return {accepted:false,reason,observation:null,alert:null};
}

function trustworthyAirGap(live) {
  const raw=live?.water?.distanceCm;
  if(typeof raw !== 'number' && typeof raw !== 'string') return false;
  if(typeof raw === 'string' && !raw.trim()) return false;
  // Share the production model's installation calibration and explicit
  // sensor-fault precedence. Physical transducer range is NOT tank depth.
  return Number.isFinite(waterLevelCm(live));
}

function planVirtualWaterSnapshot({live,previous=null,now=Date.now()}={}) {
  if (!Number.isSafeInteger(now) || now < Date.UTC(2000,0,1))
    return refusal('INVALID_CLOCK');
  if (previous !== null &&
      (!previous || previous.topic !== 'water' ||
       !ACCEPTED.has(previous.phase) || !Number.isSafeInteger(previous.sourceAt)))
    return refusal('INVALID_PREVIOUS');
  const ts=fieldTimeMs(live,now);
  if(ts===null || ts > now || now-ts > MAX_SOURCE_AGE_MS)
    return refusal('STALE_OR_INVALID_SOURCE_TIME');
  // Physical air-gap telemetry is mandatory for automated virtual planning.
  // A Firebase backend SAFE label alone cannot prove recovery.
  if(!trustworthyAirGap(live)) return refusal('NO_VERIFIED_AIR_GAP');
  const phase=level(live);
  if(!ACCEPTED.has(phase)) return refusal('UNTRUSTWORTHY_WATER_LEVEL');
  if(previous && ts <= previous.sourceAt) return refusal('NON_MONOTONIC_SOURCE_TIME');

  const observation={topic:'water',phase,sourceAt:ts};
  if(!previous || previous.phase === phase)
    return {accepted:true,reason:'VERIFIED',observation,alert:null};

  // No real warning copy, private identifiers, addresses or remote endpoints.
  // This event is only a proposal that a caller can pass to a fake outbox.
  const alert={
    key:'water:'+ts+':'+phase,topic:'water',sourceAt:ts,phase,ttlMs:7000,
    text:phase === 'SAFE'
      ? 'SYNTHETIC RECOVERY: verified virtual water state returned to SAFE. Not a real warning.'
      : 'SYNTHETIC '+phase+': verified virtual water state changed. Not a real warning.'
  };
  return {accepted:true,reason:'VERIFIED',observation,alert};
}

module.exports={planVirtualWaterSnapshot};
