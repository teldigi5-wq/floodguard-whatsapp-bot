'use strict';

// Purely synthetic command examples. Intentionally no Firebase, WhatsApp,
// subscriber storage, network access, or physical gate control.
const SCENARIOS=Object.freeze({
  offline:Object.freeze({risk:'UNKNOWN',water:'NOT AVAILABLE',gate:'NOT AVAILABLE',alarm:'NOT AVAILABLE',device:'OFFLINE'}),
  safe:Object.freeze({risk:'SAFE',water:'4.0 cm',gate:'CLOSED',alarm:'INACTIVE',device:'SIMULATED ONLINE'}),
  warning:Object.freeze({risk:'WARNING',water:'9.0 cm',gate:'CLOSED',alarm:'INACTIVE',device:'SIMULATED ONLINE'}),
  danger:Object.freeze({risk:'DANGER',water:'12.0 cm',gate:'COUNTDOWN (example only)',alarm:'ACTIVE (example only)',device:'SIMULATED ONLINE'})
});
const READ_ONLY_COMMANDS=Object.freeze(['menu','stats','water','risk','gate','rain','devices','network','emergency']);
const header='🧪 FLOODGUARD SIMULATED COMMAND PREVIEW\nNOT SENT · NOT LIVE · EXAMPLE ONLY';
function previewReply(command,scenario) {
  if(typeof command!=='string'||!READ_ONLY_COMMANDS.includes(command)){
    throw new RangeError('Only approved read-only demo commands are available.');
  }
  if(typeof scenario!=='string'||!Object.hasOwn(SCENARIOS,scenario)){
    throw new RangeError('Unknown synthetic scenario.');
  }
  const state=SCENARIOS[scenario];
  const source='Sensor source: SYNTHETIC ONLY';
  const stale=scenario==='offline'?'No live sensor data is available.':'All values are examples, not physical readings.';
  const lines={
    menu:()=>['Example commands: '+READ_ONLY_COMMANDS.join(', '),'subscribe and unsubscribe are disabled in this demo.'],
    stats:()=>['Risk: '+state.risk,'Water: '+state.water,'Gate: '+state.gate,'Alarm: '+state.alarm,stale],
    water:()=>['Water level: '+state.water,'Risk: '+state.risk,stale],
    risk:()=>['Reported risk example: '+state.risk,stale],
    gate:()=>['Gate indication: '+state.gate,'No gate control commands or actual countdown are enabled.'],
    rain:()=>['Rain gauge: NOT AVAILABLE (no example rainfall is fabricated).',stale],
    devices:()=>['Arduino: '+state.device,'ESP8266: '+state.device,'Physical devices have not been contacted.'],
    network:()=>['Firebase: NOT CONNECTED','WhatsApp: NOT CONNECTED','ESP8266 network: NOT AVAILABLE','No remote network query was made.'],
    emergency:()=>['Alarm example: '+state.alarm,'This is not an emergency notification service or a live warning.',stale]
  };
  return [header,'', 'Command: '+command, 'Scenario: '+scenario.toUpperCase(),source,'', ...lines[command]()].join('\n');
}
module.exports={previewReply,READ_ONLY_COMMANDS,SCENARIOS};
