'use strict';

// Fixed educational fixtures. Never import live devices, Firebase, WhatsApp or
// external clocks. All values are synthetic; unavailable/stale has no reading.
const SAMPLES=Object.freeze({
  offline:Object.freeze({risk:'UNAVAILABLE',water:null,gate:'UNAVAILABLE',alarm:'UNKNOWN',note:'No current reading. Offline does not mean the flashed hardware is broken.',accent:'muted'}),
  safe:Object.freeze({risk:'SAFE',water:4.0,gate:'CLOSED (example)',alarm:'INACTIVE (example)',note:'Fixed SAFE example; not a current measurement.',accent:'safe'}),
  warning:Object.freeze({risk:'WARNING',water:9.0,gate:'CLOSED (example)',alarm:'INACTIVE (example)',note:'Fixed WARNING example; no notification has been sent.',accent:'warning'}),
  danger:Object.freeze({risk:'DANGER',water:12.0,gate:'COUNTDOWN (not running)',alarm:'ACTIVE (example)',note:'Fixed DANGER example; no siren, timer, message or gate action.',accent:'danger'}),
  stale:Object.freeze({risk:'STALE',water:null,gate:'UNAVAILABLE',alarm:'UNKNOWN',note:'Example of expired telemetry. No old reading is treated as current.',accent:'warning'})
});
const KEYS=Object.freeze(Object.keys(SAMPLES));
function getDemoState(name){
  if(typeof name!=='string'||!Object.hasOwn(SAMPLES,name))throw new RangeError('Unknown simulation scenario');
  const s=SAMPLES[name],hasSample=s.water!==null;
  const unavailable='NOT AVAILABLE';
  const sample='SYNTHETIC SAMPLE';
  return {
    demoMode:true,source:'SYNTHETIC FIXTURE',deliveryEnabled:false,hardwareControlEnabled:false,
    scenario:name,risk:s.risk,accent:s.accent,note:s.note,
    cards:[
      {id:'water',label:'Water level',value:hasSample?s.water.toFixed(1)+' cm':unavailable,detail:hasSample?'Fixed fictional value · not live':'No current water reading'},
      {id:'ultrasonic',label:'Ultrasonic sensor',value:hasSample?sample:unavailable,detail:'HC-SR04 not queried or contacted'},
      {id:'rain',label:'Rain gauge',value:unavailable,detail:'No rainfall value invented'},
      {id:'risk',label:'Flood risk',value:s.risk,detail:'Fictional classification · not a public warning'},
      {id:'alarm',label:'Alarm indication',value:s.alarm,detail:'No physical buzzer or alert delivery'},
      {id:'gate',label:'Gate indication',value:s.gate,detail:'No servo movement or countdown'},
      {id:'esp8266',label:'ESP8266 connectivity',value:hasSample?'SIMULATION ONLY':'NOT CONNECTED',detail:'No physical ESP8266 network connection'},
      {id:'firebase',label:'Firebase connectivity',value:'NOT CONNECTED',detail:'No RTDB requests, streaming or writes'}
    ],
    alerts:[
      {kind:'info',when:'Example 01',title:'SAFE · synthetic sample',detail:'An illustrative low-risk classification. No live reading or event.'},
      {kind:'warning',when:'Example 02',title:'WARNING · synthetic sample',detail:'Fictional threshold warning; no notification was sent.'},
      {kind:'danger',when:'Example 03',title:'DANGER · synthetic sample',detail:'Fictional critical alert; no alarm or physical gate action.'},
      {kind:'blocked',when:'Example 04',title:'Sensor unavailable · synthetic sample',detail:'An example of missing telemetry; no current reading can be inferred.'},
      {kind:'info',when:'Example 05',title:'Recovery · synthetic sample',detail:'Fictional recovery event; never recorded in Firebase or sent to users.'}
    ],
    diagnostics:[
      {id:'mode',name:'Command Center',status:'DEMO ACTIVE',detail:'Authenticated browser fixture preview only'},
      {id:'whatsapp',name:'WhatsApp / Baileys',status:'DISABLED',detail:'No QR, linked session or message transport'},
      {id:'firebase',name:'Firebase realtime data',status:'DISABLED',detail:'No RTDB reads, writes or subscriptions'},
      {id:'arduino',name:'Arduino + ESP8266',status:'NOT CONTACTED',detail:'Existing flashed firmware and sensors untouched'},
      {id:'gate',name:'Physical gate controls',status:'DISABLED',detail:'No countdown, servo movement or real alert occurs'},
      {id:'storage',name:'Session / subscriber storage',status:'NOT USED',detail:'Demo does not open, read or write WhatsApp session files'},
      {id:'preflight',name:'Live-host preflight',status:'NOT RUN',detail:'Run npm run doctor separately before any approved live setup'}
    ]
  };
}
module.exports={getDemoState,KEYS};
