'use strict';

// In-memory sample data only. No live database, clock timestamps, alarms,
// session credentials, network calls or physical control are used.
const SAMPLES=Object.freeze({
  offline:Object.freeze({risk:'UNAVAILABLE',water:null,gate:'UNAVAILABLE',alarm:'UNKNOWN',rain:null,device:'NOT CONNECTED',note:'No current reading is available. Offline does not prove a hardware fault.',accent:'muted'}),
  safe:Object.freeze({risk:'SAFE',water:4.0,gate:'CLOSED (example)',alarm:'INACTIVE (example)',rain:null,device:'SIMULATED ONLINE',note:'A static safe-state example, not a current reservoir measurement.',accent:'safe'}),
  warning:Object.freeze({risk:'WARNING',water:9.0,gate:'CLOSED (example)',alarm:'INACTIVE (example)',rain:null,device:'SIMULATED ONLINE',note:'A static warning-state example. No live notification has been sent.',accent:'warning'}),
  danger:Object.freeze({risk:'DANGER',water:12.0,gate:'COUNTDOWN (example, not running)',alarm:'ACTIVE (example)',rain:null,device:'SIMULATED ONLINE',note:'Danger example only. No live gate action, countdown or message is triggered.',accent:'danger'})
});
const KEYS=Object.freeze(Object.keys(SAMPLES));
function getDemoState(name){
  if(typeof name!=='string'||!Object.hasOwn(SAMPLES,name))throw new RangeError('Unknown simulation scenario');
  const s=SAMPLES[name];
  const riskEvent=name==='offline'?'Reading unavailable':'Risk classification example';
  return {
    demoMode:true,source:'SYNTHETIC FIXTURE',deliveryEnabled:false,hardwareControlEnabled:false,
    scenario:name,risk:s.risk,accent:s.accent,
    cards:[
      {id:'water',label:'Water level',value:s.water===null?'NOT AVAILABLE':s.water.toFixed(1)+' cm',detail:'Synthetic measurement only'},
      {id:'gate',label:'Gate indication',value:s.gate,detail:'No physical movement'},
      {id:'alarm',label:'Alarm indication',value:s.alarm,detail:'No siren or message'},
      {id:'rain',label:'Rainfall',value:'NOT AVAILABLE',detail:'No rainfall figure fabricated'}
    ],
    note:s.note,
    alerts:[
      {kind:'info',when:'Example 01',title:'Offline simulation loaded',detail:'The preview is local. Nothing was recorded or transmitted.'},
      {kind:name==='danger'?'danger':name==='warning'?'warning':'info',when:'Example 02',title:riskEvent,detail:name==='offline'?'No sensor reading was supplied.':'Synthetic risk label: '+s.risk+'. This is not a live event.'},
      {kind:'blocked',when:'Example 03',title:'Outbound delivery disabled',detail:'No WhatsApp notifications, subscriber updates or physical commands.'}
    ],
    diagnostics:[
      {id:'whatsapp',name:'WhatsApp / Baileys',status:'DISABLED',detail:'No QR, linked session or message transport'},
      {id:'firebase',name:'Firebase realtime data',status:'DISABLED',detail:'No RTDB requests, stream subscriptions or writes'},
      {id:'arduino',name:'Arduino + ESP8266',status:'NOT CONTACTED',detail:'Already-flashed hardware remains untouched'},
      {id:'gate',name:'Physical gate controls',status:'DISABLED',detail:'No gate countdown, servo movement or real alert occurs'},
      {id:'storage',name:'Session / subscriber storage',status:'NOT USED',detail:'Simulation does not read or save account data'}
    ]
  };
}
module.exports={getDemoState,KEYS};
