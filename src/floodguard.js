const {getSubscribers,subscribe,unsubscribe,getState,saveState}=require("./store");
const v=(x,s="")=>x===undefined||x===null||x===""?"NOT AVAILABLE":`${x}${s}`;
function level(l){const s=String(l?.water?.status||"").toUpperCase();if(["SAFE","WARNING","DANGER"].includes(s))return s;const d=Number(l?.water?.distanceCm);if(!Number.isFinite(d))return"UNKNOWN";return d>15?"SAFE":d>12?"WARNING":"DANGER"}
const menu=()=>`🌊 *FLOODGUARD*

Smart Flood Monitoring & Dam Gate Control System

📊 stats
💧 water
🛡️ risk
🚧 gate
🌧️ rain
🔧 devices
🚨 emergency
🔔 subscribe
🔕 unsubscribe
❓ help

Send *stats* anytime for live data.`;
function stats(l){if(!l)return"⚠️ FloodGuard live data is NOT AVAILABLE.";return`🌊 *FLOODGUARD LIVE STATS*

💧 Distance to Water: ${v(l?.water?.distanceCm," cm")}
💧 Water Status: ${v(l?.water?.status)}

🛡️ Flood Risk:
${v(l?.system?.overallRisk)}

🚧 Dam Gate:
${v(l?.gate?.status)}

📐 Gate Angle:
${v(l?.gate?.angle,"°")}

🚨 Alarm:
${v(l?.alarm?.active)}

📡 ESP8266:
${v(l?.esp8266?.status)}

🕒 Last Update:
${v(l?.system?.lastUpdate)}`}

async function commandReply(jid,text,getLive){const c=String(text||"").trim().toLowerCase().split(/\s+/)[0];
if(["hi","hello","menu","help"].includes(c))return menu();
if(c==="subscribe"){subscribe(jid);return"🔔 *FLOODGUARD ALERTS ENABLED*"}
if(c==="unsubscribe"){unsubscribe(jid);return"🔕 *FLOODGUARD ALERTS DISABLED*"}
let l;try{l=await getLive()}catch(e){return`⚠️ Firebase NOT AVAILABLE.\n${e.message}`}
if(["stats","status"].includes(c))return stats(l);
if(c==="water")return`💧 *WATER*\n\n📏 Distance to Water: ${v(l?.water?.distanceCm," cm")}\nStatus: ${v(l?.water?.status)}\n\nSmaller distance = higher water.`;
if(["risk","flood"].includes(c))return`🛡️ *FLOOD RISK*\n\nOverall Risk: ${v(l?.system?.overallRisk)}\nWater Status: ${level(l)}`;
if(c==="gate")return`🚧 *DAM GATE*\n\nStatus: ${v(l?.gate?.status)}\nAngle: ${v(l?.gate?.angle,"°")}\nCountdown: ${v(l?.gate?.countdownSeconds," seconds")}\nReason: ${v(l?.gate?.reason)}`;
if(["rain","rainfall"].includes(c))return`🌧️ *RAINFALL*\n\nStatus: ${v(l?.rain?.status)}\nRainfall: ${v(l?.rain?.rainfallMm??l?.rain?.mm," mm")}`;
if(["devices","health"].includes(c))return`🔧 *DEVICE HEALTH*\n\nESP8266: ${v(l?.esp8266?.status)}\nDevices: ${l?.devices?JSON.stringify(l.devices,null,2):"NOT AVAILABLE"}`;
if(["emergency","alarm"].includes(c))return`🚨 *EMERGENCY*\n\nAlarm: ${v(l?.alarm?.active)}\nRisk: ${v(l?.system?.overallRisk)}\nWater: ${level(l)}`;
return`❓ Unknown command: *${c||"(empty)"}*\n\nSend *menu*.`}

async function sendAll(sock,text){for(const jid of getSubscribers()){try{await sock.sendMessage(jid,{text})}catch(e){console.error("send",jid,e.message)}}}
const gate=l=>String(l?.gate?.status||"UNKNOWN").toUpperCase();
const opening=l=>gate(l).includes("OPENING")||(level(l)==="DANGER"&&gate(l)==="CLOSED"&&Number(l?.gate?.countdownSeconds)>0);

async function processLiveChange(sock,l){if(!l)return;let s=getState();const n=level(l),g=gate(l),cd=Number(l?.gate?.countdownSeconds);
if(!s.initialized){saveState({...s,initialized:true,level:n,gateStatus:g,procedureId:opening(l)?`existing-${Date.now()}`:null,sentCountdown:[]});return}
if(s.level!==n){
 if(n==="WARNING")await sendAll(sock,`🟡 *FLOODGUARD WARNING*\n\n⚠️ Water level is rising.\n\n📏 Distance to Water: ${v(l?.water?.distanceCm," cm")}\n💧 Status: WARNING\n🛡️ Flood Risk: ${v(l?.system?.overallRisk)}\n🚧 Dam Gate: ${v(l?.gate?.status)}`);
 if(n==="DANGER")await sendAll(sock,`🚨🚨 *FLOODGUARD DANGER* 🚨🚨\n\nCritical water level detected.\n\n📏 Distance to Water: ${v(l?.water?.distanceCm," cm")}\n🔴 Status: DANGER\n🛡️ Flood Risk: ${v(l?.system?.overallRisk)}\n🚨 Alarm: ${v(l?.alarm?.active)}`);
 if(n==="SAFE")await sendAll(sock,`✅ *FLOODGUARD RECOVERY*\n\nWater conditions have returned to safe level.\n\n💧 Status: SAFE\n📏 Distance: ${v(l?.water?.distanceCm," cm")}\n🚧 Dam Gate: ${v(l?.gate?.status)}\n🛡️ Flood Risk: ${v(l?.system?.overallRisk)}`)}
let pid=s.procedureId, sent=Array.isArray(s.sentCountdown)?s.sentCountdown:[];
if(opening(l)&&!pid){pid=`gate-${Date.now()}`;sent=[];await sendAll(sock,`🚨 *DAM GATE OPENING WARNING*\n\n🚧 Dam Gate: ${v(l?.gate?.status)}\n⏱️ Gate opening in: ${v(l?.gate?.countdownSeconds," seconds")}\n📏 Water Distance: ${v(l?.water?.distanceCm," cm")}`)}
if(pid&&Number.isFinite(cd)){for(const m of [30,20,10,5,3,2,1])if(cd<=m&&cd>=Math.max(0,m-1.5)&&!sent.includes(m)){await sendAll(sock,`${m===5?"🚨 *FINAL GATE WARNING*":m===10?"🚨 *DAM GATE OPENING SOON*":"⚠️ *DAM GATE COUNTDOWN*"}\n\n⏱️ *${m} SECONDS*\n\n🔴 Water Status: ${n}`);sent.push(m)}}
if(g==="OPEN"&&s.gateStatus!=="OPEN"){await sendAll(sock,`🚧 *FLOODGUARD DAM GATE OPEN*\n\nThe dam gate has opened.\n\n📐 Gate Angle: ${v(l?.gate?.angle,"°")}\n📏 Water Distance: ${v(l?.water?.distanceCm," cm")}\n🔴 Water Status: ${v(l?.water?.status)}\n🛡️ Flood Risk: ${v(l?.system?.overallRisk)}`);pid=null;sent=[]}
if(pid&&!opening(l)&&g==="CLOSED"){await sendAll(sock,`✅ *GATE OPENING CANCELLED*\n\n🚧 Dam Gate: CLOSED\n💧 Water Status: ${n}`);pid=null;sent=[]}
saveState({...s,initialized:true,level:n,gateStatus:g,procedureId:pid,sentCountdown:sent,lastUpdate:Date.now()})}
module.exports={commandReply,processLiveChange};