const { getSubscribers, subscribe, unsubscribe, getState, saveState } = require('./store');

const STALE_AFTER_MS = Number(process.env.FLOODGUARD_STALE_MS || 15000);

const v = (x, suffix = '') =>
  x === undefined || x === null || x === '' ? 'NOT AVAILABLE' : `${x}${suffix}`;

const upper = (x, fallback = 'UNKNOWN') => {
  const s = String(x ?? '').trim().toUpperCase();
  return s || fallback;
};

function normalizeDevice(x) {
  const s = upper(x);
  if (s === 'REMOVED' || s === 'NOT INSTALLED' || s === 'NOT_INSTALLED') return 'NOT_INSTALLED';
  if (s === 'CONNECTED') return 'ONLINE';
  if (s === 'DISCONNECTED') return 'OFFLINE';
  if (['ONLINE', 'OFFLINE', 'UNKNOWN'].includes(s)) return s;
  return 'UNKNOWN';
}

function normalizeGate(live) {
  const angle = Number(live?.gate?.angle);
  const countdown = Number(live?.gate?.countdownSeconds);
  let raw = upper(live?.gate?.status, 'CLOSED');

  if (raw === 'OPENING_WARNING') raw = 'COUNTDOWN';
  if (Number.isFinite(countdown) && countdown > 0) return 'COUNTDOWN';
  if (Number.isFinite(angle) && angle >= 80) return 'OPEN';
  if (Number.isFinite(angle) && angle <= 2) return 'CLOSED';
  if (['CLOSED', 'COUNTDOWN', 'OPEN'].includes(raw)) return raw;
  return 'UNKNOWN';
}

function level(live) {
  const s = upper(live?.water?.status);
  if (['SAFE', 'WARNING', 'DANGER'].includes(s)) return s;
  if (s === 'SENSOR_ERROR' || s === 'ERROR') return 'SENSOR_ERROR';

  const d = Number(live?.water?.distanceCm);
  if (!Number.isFinite(d) || d <= 0) return 'UNKNOWN';
  if (d > 15) return 'SAFE';
  if (d > 12) return 'WARNING';
  return 'DANGER';
}

function risk(live) {
  const r = upper(live?.system?.overallRisk);
  return ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'].includes(r) ? r : 'UNKNOWN';
}

function isStale(live) {
  const ts = Number(live?.system?.lastUpdate);
  return Number.isFinite(ts) && ts > 0 ? Date.now() - ts > STALE_AFTER_MS : true;
}

function ageText(live) {
  const ts = Number(live?.system?.lastUpdate);
  if (!Number.isFinite(ts) || ts <= 0) return 'NOT AVAILABLE';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 2) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function freshnessLine(live) {
  return isStale(live)
    ? `⚠️ Data: STALE (${ageText(live)})`
    : `🟢 Data: LIVE (${ageText(live)})`;
}

function boolText(value) {
  if (value === true || value === 1 || String(value).toLowerCase() === 'true') return 'ACTIVE';
  if (value === false || value === 0 || String(value).toLowerCase() === 'false') return 'CLEAR';
  return 'UNKNOWN';
}

function rainInstalled(live) {
  const state = normalizeDevice(live?.devices?.rainGauge);
  return state === 'ONLINE';
}

function deviceLines(live) {
  const d = live?.devices || {};
  const esp = normalizeDevice(live?.esp8266?.status || live?.esp8266?.connection);
  const rows = [
    ['Arduino Uno', normalizeDevice(d.arduino)],
    ['ESP8266', esp],
    ['HC-SR04', normalizeDevice(d.ultrasonic)],
    ['RTC', normalizeDevice(d.rtc)],
    ['Servo', normalizeDevice(d.servo)],
  ];
  return rows.map(([name, state]) => `${state === 'ONLINE' ? '🟢' : state === 'OFFLINE' ? '🔴' : '⚪'} ${name}: ${state}`).join('\n');
}

const menu = () => `🌊 *FLOODGUARD BOT*

Real-time Flood Monitoring & Dam Gate Alerts

📊 *stats* — complete live summary
💧 *water* — water distance/status
🛡️ *risk* — flood risk
🚧 *gate* — gate state/countdown
🔧 *devices* — installed device health
🌧️ *rain* — rain-gauge availability
🚨 *emergency* — alarm summary
📶 *network* — ESP8266 connection
🔔 *subscribe* — automatic alerts ON
🔕 *unsubscribe* — automatic alerts OFF
❓ *help* — show this menu

Send *stats* anytime.`;

function stats(live) {
  if (!live) return '⚠️ FloodGuard live data is NOT AVAILABLE.';
  const gate = normalizeGate(live);
  const countdown = Number(live?.gate?.countdownSeconds);
  const gateExtra = gate === 'COUNTDOWN' && Number.isFinite(countdown) && countdown > 0
    ? ` (${countdown}s)` : '';

  return `🌊 *FLOODGUARD LIVE STATS*

${freshnessLine(live)}

💧 Water: *${level(live)}*
📏 Distance: ${v(live?.water?.distanceCm, ' cm')}
🛡️ Flood Risk: *${risk(live)}*

🚧 Gate: *${gate}*${gateExtra}
📐 Servo Angle: ${v(live?.gate?.angle, '°')}
🚨 Alarm: ${boolText(live?.alarm?.active)}

📡 ESP8266: ${normalizeDevice(live?.esp8266?.status || live?.esp8266?.connection)}
🕒 Last Update: ${ageText(live)}`;
}

async function commandReply(jid, text, getLive) {
  const c = String(text || '').trim().toLowerCase().split(/\s+/)[0];

  if (['hi', 'hello', 'hey', 'menu', 'help', 'start'].includes(c)) return menu();
  if (c === 'subscribe') {
    subscribe(jid);
    return '🔔 *FLOODGUARD ALERTS ENABLED*\n\nYou will receive level changes, gate countdown warnings, gate-open alerts, and recovery notifications.';
  }
  if (c === 'unsubscribe') {
    unsubscribe(jid);
    return '🔕 *FLOODGUARD ALERTS DISABLED*\n\nAutomatic FloodGuard alerts have been stopped.';
  }

  let live;
  try {
    live = await getLive();
  } catch (e) {
    return `⚠️ *FIREBASE NOT AVAILABLE*\n\n${e.message}\n\nNo sensor value has been fabricated.`;
  }

  if (['stats', 'status'].includes(c)) return stats(live);
  if (!live) return '⚠️ FloodGuard live data is NOT AVAILABLE right now.';

  if (c === 'water') {
    return `💧 *WATER LEVEL*\n\n${freshnessLine(live)}\n📏 Distance to Water: ${v(live?.water?.distanceCm, ' cm')}\nStatus: *${level(live)}*\n\nSmaller HC-SR04 distance means higher water.`;
  }

  if (['risk', 'flood'].includes(c)) {
    return `🛡️ *FLOOD RISK*\n\n${freshnessLine(live)}\nOverall Risk: *${risk(live)}*\nWater Status: ${level(live)}\nAlarm: ${boolText(live?.alarm?.active)}`;
  }

  if (c === 'gate') {
    const g = normalizeGate(live);
    const cd = Number(live?.gate?.countdownSeconds);
    return `🚧 *DAM GATE*\n\nStatus: *${g}*\nAngle: ${v(live?.gate?.angle, '°')}\nCountdown: ${g === 'COUNTDOWN' && Number.isFinite(cd) ? `${cd} seconds` : '0 seconds'}\nReason: ${v(live?.gate?.reason)}\n\n${freshnessLine(live)}`;
  }

  if (['rain', 'rainfall'].includes(c)) {
    if (!rainInstalled(live)) {
      return '🌧️ *RAINFALL*\n\nRain Gauge: *PLANNED / NOT INSTALLED*\n\nFloodGuard will show real rainfall values after the physical rain gauge is added and calibrated. No fake rainfall value is reported.';
    }
    return `🌧️ *RAINFALL*\n\nCurrent: ${v(live?.rain?.currentMm, ' mm')}\nDaily: ${v(live?.rain?.dailyMm, ' mm')}\nStatus: ${v(live?.rain?.status)}\n\n${freshnessLine(live)}`;
  }

  if (['devices', 'health'].includes(c)) {
    return `🔧 *DEVICE HEALTH*\n\n${deviceLines(live)}\n\n🌧️ Rain Gauge: PLANNED\n💾 MicroSD: NOT INSTALLED\n📱 GSM: NOT INSTALLED`;
  }

  if (['network', 'esp', 'wifi'].includes(c)) {
    return `📶 *ESP8266 NETWORK*\n\nStatus: ${normalizeDevice(live?.esp8266?.status)}\nConnection: ${v(live?.esp8266?.connection)}\nSignal: ${v(live?.esp8266?.rssi, ' dBm')}\n\n${freshnessLine(live)}`;
  }

  if (['emergency', 'alarm'].includes(c)) {
    return `🚨 *EMERGENCY STATUS*\n\nAlarm: ${boolText(live?.alarm?.active)}\nType: ${v(live?.alarm?.type)}\nRisk: *${risk(live)}*\nWater: *${level(live)}*\nGate: *${normalizeGate(live)}*`;
  }

  return `❓ Unknown command: *${c || '(empty)'}*\n\nSend *menu* to see FloodGuard commands.`;
}

async function sendAll(sock, text) {
  const subscribers = [...getSubscribers()];
  if (!subscribers.length) return;
  for (const jid of subscribers) {
    try {
      await sock.sendMessage(jid, { text });
    } catch (e) {
      console.error('WhatsApp send failed', jid, e.message);
    }
  }
}

function opening(live) {
  return normalizeGate(live) === 'COUNTDOWN' && Number(live?.gate?.countdownSeconds) > 0;
}

function eventKey(prefix, live, extra = '') {
  // Based on state transition and source timestamp, not Date.now alone.
  const sourceTs = Number(live?.system?.lastUpdate) || 0;
  return `${prefix}:${sourceTs}:${extra}`;
}

async function processLiveChange(sock, live) {
  if (!live) return;

  const currentLevel = level(live);
  const currentGate = normalizeGate(live);
  const countdown = Number(live?.gate?.countdownSeconds);
  const stale = isStale(live);
  let state = getState();

  // Never generate safety alerts from stale snapshots.
  // We still update heartbeat metadata so the bot remains observable.
  if (stale) {
    saveState({ ...state, lastSeenAt: Date.now(), dataStale: true });
    return;
  }

  if (!state.initialized) {
    saveState({
      ...state,
      initialized: true,
      level: currentLevel,
      gateStatus: currentGate,
      procedureId: opening(live) ? `existing-${Number(live?.system?.lastUpdate) || Date.now()}` : null,
      sentCountdown: [],
      lastSeenAt: Date.now(),
      dataStale: false
    });
    return;
  }

  const previousLevel = state.level || 'UNKNOWN';
  const previousGate = state.gateStatus || 'UNKNOWN';
  let procedureId = state.procedureId || null;
  let sentCountdown = Array.isArray(state.sentCountdown) ? state.sentCountdown : [];
  let lastEventKey = state.lastEventKey || '';

  if (previousLevel !== currentLevel) {
    const key = eventKey('level', live, `${previousLevel}->${currentLevel}`);
    if (key !== lastEventKey) {
      if (currentLevel === 'WARNING') {
        await sendAll(sock, `🟡 *FLOODGUARD WARNING*\n\nWater has entered the warning zone.\n\n📏 Distance: ${v(live?.water?.distanceCm, ' cm')}\n💧 Status: WARNING\n🛡️ Risk: ${risk(live)}\n🚧 Gate: ${currentGate}`);
      } else if (currentLevel === 'DANGER') {
        await sendAll(sock, `🚨 *FLOODGUARD DANGER*\n\nCritical water level detected.\n\n📏 Distance: ${v(live?.water?.distanceCm, ' cm')}\n🔴 Water: DANGER\n🛡️ Risk: ${risk(live)}\n🚨 Alarm: ${boolText(live?.alarm?.active)}\n\nFloodGuard is monitoring the gate-opening sequence.`);
      } else if (currentLevel === 'SAFE' && ['WARNING', 'DANGER'].includes(previousLevel)) {
        await sendAll(sock, `✅ *FLOODGUARD RECOVERY*\n\nWater conditions have returned to SAFE.\n\n📏 Distance: ${v(live?.water?.distanceCm, ' cm')}\n🚧 Gate: ${currentGate}\n🛡️ Risk: ${risk(live)}`);
      } else if (currentLevel === 'SENSOR_ERROR') {
        await sendAll(sock, '⚠️ *FLOODGUARD SENSOR ALERT*\n\nThe water sensor is not providing a valid reading. FloodGuard will not fabricate a water level.');
      }
      lastEventKey = key;
    }
  }

  if (opening(live) && !procedureId) {
    procedureId = `gate-${Number(live?.system?.lastUpdate) || Date.now()}`;
    sentCountdown = [];
    await sendAll(sock, `🚨 *DAM GATE OPENING WARNING*\n\nThe DANGER condition has started the gate countdown.\n\n⏱️ Opening in: ${v(countdown, ' seconds')}\n📏 Water Distance: ${v(live?.water?.distanceCm, ' cm')}\n🚧 Gate: COUNTDOWN`);
  }

  // Current physical countdown is 10 seconds, so send useful milestones only.
  if (procedureId && currentGate === 'COUNTDOWN' && Number.isFinite(countdown)) {
    for (const milestone of [10, 5, 3, 2, 1]) {
      if (countdown <= milestone && countdown >= Math.max(0, milestone - 1.25) && !sentCountdown.includes(milestone)) {
        const title = milestone === 5
          ? '🚨 *FINAL GATE WARNING*'
          : milestone === 10
            ? '🚨 *DAM GATE OPENING SOON*'
            : '⚠️ *DAM GATE COUNTDOWN*';
        await sendAll(sock, `${title}\n\n⏱️ *${milestone} SECOND${milestone === 1 ? '' : 'S'}*\n\n🔴 Water: ${currentLevel}\n🚧 Gate: COUNTDOWN`);
        sentCountdown.push(milestone);
      }
    }
  }

  if (currentGate === 'OPEN' && previousGate !== 'OPEN') {
    await sendAll(sock, `🚧 *FLOODGUARD DAM GATE OPEN*\n\nThe prototype dam gate is OPEN.\n\n📐 Servo Angle: ${v(live?.gate?.angle, '°')}\n📏 Water Distance: ${v(live?.water?.distanceCm, ' cm')}\n🔴 Water: ${currentLevel}\n🛡️ Risk: ${risk(live)}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (procedureId && currentGate === 'CLOSED' && currentLevel !== 'DANGER') {
    await sendAll(sock, `✅ *GATE OPENING CANCELLED*\n\nThe countdown ended because the confirmed water state changed.\n\n🚧 Gate: CLOSED\n💧 Water: ${currentLevel}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (previousGate === 'OPEN' && currentGate === 'CLOSED') {
    await sendAll(sock, `🔒 *DAM GATE CLOSED*\n\nThe prototype gate has returned to 0°.\n\n💧 Water: ${currentLevel}\n📏 Distance: ${v(live?.water?.distanceCm, ' cm')}`);
  }

  saveState({
    ...state,
    initialized: true,
    level: currentLevel,
    gateStatus: currentGate,
    procedureId,
    sentCountdown,
    lastEventKey,
    lastSeenAt: Date.now(),
    dataStale: false
  });
}

module.exports = {
  commandReply,
  processLiveChange,
  stats,
  normalizeGate,
  normalizeDevice,
  level,
  isStale
};
