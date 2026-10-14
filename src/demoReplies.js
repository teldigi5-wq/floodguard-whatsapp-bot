'use strict';

// Pure, approved read-only examples. Never read storage, secrets or live data.
const SCENARIOS=Object.freeze({
  offline:Object.freeze({risk:'UNAVAILABLE',water:'NOT AVAILABLE',gate:'NOT AVAILABLE',alarm:'NOT AVAILABLE',device:'NOT CONNECTED'}),
  safe:Object.freeze({risk:'SAFE',water:'4.0 cm',gate:'CLOSED (example)',alarm:'INACTIVE (example)',device:'SIMULATION ONLY'}),
  warning:Object.freeze({risk:'WARNING',water:'9.0 cm',gate:'CLOSED (example)',alarm:'INACTIVE (example)',device:'SIMULATION ONLY'}),
  danger:Object.freeze({risk:'DANGER',water:'12.0 cm',gate:'COUNTDOWN (not running)',alarm:'ACTIVE (example)',device:'SIMULATION ONLY'}),
  stale:Object.freeze({risk:'STALE',water:'NOT AVAILABLE',gate:'NOT AVAILABLE',alarm:'NOT AVAILABLE',device:'NOT CONNECTED'})
});
const READ_ONLY_COMMANDS=Object.freeze(['menu','stats','water','risk','gate','rain','devices','network','emergency']);
const header='🧪 FLOODGUARD SIMULATED COMMAND PREVIEW\nNOT SENT · NOT LIVE · EXAMPLE ONLY';
function previewReply(command,scenario){
  if(typeof command!=='string'||!READ_ONLY_COMMANDS.includes(command))throw new RangeError('Only approved read-only demo commands are available.');
  if(typeof scenario!=='string'||!Object.hasOwn(SCENARIOS,scenario))throw new RangeError('Unknown synthetic scenario.');
  const s=SCENARIOS[scenario];
  const unavailable=scenario==='offline'?'Offline: no sensor measurements are available.':scenario==='stale'?'Stale telemetry example: historical readings must not be used as current values.':'Fixed fictional values; physical sensors have not been contacted.';
  const lines={
    menu:()=>['Example commands: '+READ_ONLY_COMMANDS.join(', '),'subscribe, unsubscribe and physical commands are disabled.'],
    stats:()=>['Risk: '+s.risk,'Water: '+s.water,'Gate: '+s.gate,'Alarm: '+s.alarm,unavailable],
    water:()=>['Water level: '+s.water,'Risk: '+s.risk,unavailable],
    risk:()=>['Reported risk example: '+s.risk,unavailable],
    gate:()=>['Gate indication: '+s.gate,'No gate control commands or actual countdown are enabled.'],
    rain:()=>['Rain gauge: NOT AVAILABLE (no example rainfall is fabricated).',unavailable],
    devices:()=>['Arduino: '+s.device,'ESP8266: '+s.device,'Physical devices have not been contacted.'],
    network:()=>['Firebase: NOT CONNECTED','WhatsApp: NOT CONNECTED','ESP8266 network: NOT CONNECTED','No remote network query was made.'],
    emergency:()=>['Alarm example: '+s.alarm,'This is not an emergency notification service or a live warning.',unavailable]
  };
  return [header,'','Command: '+command,'Scenario: '+scenario.toUpperCase(),'Sensor source: SYNTHETIC ONLY','',...lines[command]()].join('\n');
}
module.exports={previewReply,READ_ONLY_COMMANDS,SCENARIOS};
