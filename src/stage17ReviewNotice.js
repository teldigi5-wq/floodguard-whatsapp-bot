'use strict';
// Stage 17 — read-only synthetic display-copy candidates.
// NOT wired to bot.js, live commandReply, subscribers or WhatsApp.
const CASES=Object.freeze({
  'zero-distance-diverges':Object.freeze({
    id:'water',headline:'WATER READING UNVERIFIED',
    explanation:'The synthetic air-gap and level reports disagree; sensor meaning needs review.'
  }),
  'gate-raw-open-but-zero-angle':Object.freeze({
    id:'gate',headline:'GATE POSITION CONFLICT',
    explanation:'Synthetic OPEN status conflicts with a zero-degree angle. Actual position is unknown.'
  }),
  'gate-middle-angle-raw-closed':Object.freeze({
    id:'gate',headline:'GATE POSITION CONFLICT',
    explanation:'Synthetic CLOSED status conflicts with an intermediate angle. Actual position is unknown.'
  }),
  'reported-risk-conflicts-derived-rain-critical':Object.freeze({
    id:'risk',headline:'OVERALL RISK REQUIRES REVIEW',
    explanation:'Synthetic rainfall severity conflicts with the separately reported LOW risk.'
  }),
  'sensor-unavailable-fallback-low-risk':Object.freeze({
    id:'risk',headline:'OVERALL RISK REQUIRES REVIEW',
    explanation:'Missing water and rainfall reports cannot establish a safe condition.'
  }),
  'stale-20s-on-connected-database':Object.freeze({
    id:'freshness',headline:'READING FRESHNESS UNVERIFIED',
    explanation:'A 20-second-old synthetic field timestamp crosses the existing bot and website freshness windows.'
  }),
  'future-field-clock':Object.freeze({
    id:'freshness',headline:'INVALID SOURCE TIMESTAMP',
    explanation:'The synthetic field clock is implausibly future-dated and cannot verify live hardware.'
  }),
  'fresh-field-clock-but-disconnected':Object.freeze({
    id:'freshness',headline:'SOURCE CONNECTION UNVERIFIED',
    explanation:'A recent stored timestamp does not establish an active hardware connection.'
  }),
  'concordant-safe':Object.freeze({
    id:'water',headline:'SAFE REPORTED — NOT VERIFIED',
    explanation:'A synthetic SAFE reading is reported, not independently physically verified.'
  })
});
const HEADER='REVIEW-ONLY · SYNTHETIC · NOT SENT · NOT LIVE';
function stage17PreviewNotice(scenario){
  if(typeof scenario!=='string'||!Object.hasOwn(CASES,scenario))
    throw new RangeError('Unsupported synthetic Stage 17 review scenario');
  const s=CASES[scenario];
  return [HEADER,'',s.headline,s.explanation,
    'No WhatsApp message sent. No Firebase or physical device contacted.',
    'Not an emergency warning, not a safety decision.'].join('\n');
}
module.exports={stage17PreviewNotice,STAGE17_SYNTHETIC_SCENARIOS:Object.freeze(Object.keys(CASES))};
