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
  // Do not coerce null or blank telemetry into physical position zero.
  const angle = sensorNumber(live?.gate?.angle);
  const countdown = sensorNumber(live?.gate?.countdownSeconds);
  let raw = upper(live?.gate?.status);

  if (raw === 'OPENING_WARNING') raw = 'COUNTDOWN';
  if (Number.isFinite(countdown) && countdown > 0) return 'COUNTDOWN';
  if (Number.isFinite(angle) && angle >= 80) return 'OPEN';
  if (Number.isFinite(angle) && angle <= 2) return 'CLOSED';
  if (['CLOSED', 'COUNTDOWN', 'OPEN'].includes(raw)) return raw;
  return 'UNKNOWN';
}

const WATER_SENSOR_TO_BOTTOM_CM = Number(process.env.WATER_SENSOR_TO_BOTTOM_CM || 25);
const WARNING_LEVEL_CM = 8.5;
const DANGER_LEVEL_CM = 11.0;

// Null and blank Firebase sensor values are NOT valid numeric measurements.
// Number(null) and Number('') produce 0 and falsely report SAFE conditions.
function sensorNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function waterLevelCm(live) {
  // The physical HC-SR04 air gap is the authoritative live measurement.
  // Firebase multi-location PATCHes can briefly leave levelCm/status one event
  // behind distanceCm, so derive the level from distance whenever available.
  const reportedDistance = live?.water?.distanceCm;
  const distance = sensorNumber(reportedDistance);
  if (live?.water != null && Object.hasOwn(live.water, 'distanceCm')) {
    // HC-SR04 out-of-range measurements are errors, not SAFE. Do not use a
    // potentially stale levelCm to hide a present but invalid air-gap reading.
    if (distance === null || distance <= 0 || distance > 400) return null;
    return Math.max(0, Math.min(WATER_SENSOR_TO_BOTTOM_CM, WATER_SENSOR_TO_BOTTOM_CM - distance));
  }

  // Direct-only providers are supported, but an explicit invalid air-gap
  // field or an error status must not be overwritten with stale level data.
  if (['SENSOR_ERROR', 'ERROR'].includes(upper(live?.water?.status))) return null;
  const direct = sensorNumber(live?.water?.levelCm);
  if (direct !== null && direct >= 0 && direct <= WATER_SENSOR_TO_BOTTOM_CM) {
    return direct;
  }

  return null;
}

function level(live) {
  const cm = waterLevelCm(live);
  if (Number.isFinite(cm)) {
    if (cm >= DANGER_LEVEL_CM) return 'DANGER';
    if (cm >= WARNING_LEVEL_CM) return 'WARNING';
    return 'SAFE';
  }

  // Only fall back to the backend state when no trustworthy numeric reading
  // is available. This prevents stale status + fresh distance mismatches.
  const s = upper(live?.water?.status);
  // A server-side SAFE label without a numeric sensor measurement is not
  // enough to assert a safe water level or announce recovery.
  if (s === 'SAFE') return 'UNKNOWN';
  if (['WARNING', 'DANGER'].includes(s)) return s;
  if (s === 'SENSOR_ERROR' || s === 'ERROR') return 'SENSOR_ERROR';
  return 'UNKNOWN';
}

function risk(live) {
  const r = upper(live?.system?.overallRisk);
  return ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'].includes(r) ? r : 'UNKNOWN';
}

const EARLIEST_FIELD_TIME_MS = Date.UTC(2000, 0, 1);
const MAX_FIELD_CLOCK_LEAD_MS = 5000;

// Normalize documented timestamps without turning null, zero or implausible
// future values into "LIVE" telemetry. Milliseconds and Unix seconds are
// supported; ISO strings must include a timezone indicator.
function fieldTimeMs(live, now = Date.now()) {
  const value = live?.system?.lastUpdate;
  let raw = null;
  if (typeof value === 'number' && Number.isFinite(value)) raw = value;
  else if (typeof value === 'string' && value.trim()) {
    const str = value.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(str)) raw = Number(str);
    else if (/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/i.test(str)) raw = Date.parse(str);
  }
  if (raw === null || !Number.isFinite(raw)) return null;
  const ts = raw < 1e12 ? raw * 1000 : raw;
  if (!Number.isFinite(ts) || ts < EARLIEST_FIELD_TIME_MS || ts > now + MAX_FIELD_CLOCK_LEAD_MS) return null;
  return Math.floor(ts);
}

function isStale(live) {
  const now = Date.now();
  const ts = fieldTimeMs(live, now);
  return ts === null || now - ts > STALE_AFTER_MS;
}

function ageText(live) {
  const now = Date.now();
  const ts = fieldTimeMs(live, now);
  if (ts === null) return 'NOT AVAILABLE';
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
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
    ['Rain Gauge', normalizeDevice(d.rainGauge)],
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
  const gateExtra = !isStale(live) && gate === 'COUNTDOWN' && Number.isFinite(countdown) && countdown > 0
    ? ` (${countdown}s)` : '';

  return `🌊 *FLOODGUARD ${isStale(live) ? 'LAST RECORDED STATS' : 'LIVE STATS'}*

${freshnessLine(live)}

💧 Water: *${level(live)}*
💧 Water Level: ${v(waterLevelCm(live), ' cm')}
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
    // Never send transport errors, private URLs or auth material to WhatsApp.
    return '⚠️ *FIREBASE NOT AVAILABLE*\n\nTelemetry could not be retrieved. No sensor value has been fabricated.';
  }

  if (['stats', 'status'].includes(c)) return stats(live);
  if (!live) return '⚠️ FloodGuard live data is NOT AVAILABLE right now.';

  if (c === 'water') {
    return `💧 *WATER LEVEL*\n\n${freshnessLine(live)}\n💧 Actual Level: ${v(waterLevelCm(live), ' cm')}\n📏 HC-SR04 Air Gap: ${v(live?.water?.distanceCm, ' cm')}\nStatus: *${level(live)}*\n\nRules: SAFE <8.5 cm · WARNING 8.5–<11 cm · DANGER ≥11 cm.`;
  }

  if (['risk', 'flood'].includes(c)) {
    return `🛡️ *FLOOD RISK*\n\n${freshnessLine(live)}\nOverall Risk: *${risk(live)}*\nWater Status: ${level(live)}\nAlarm: ${boolText(live?.alarm?.active)}`;
  }

  if (c === 'gate') {
    const g = normalizeGate(live);
    const cd = Number(live?.gate?.countdownSeconds);
    return `🚧 *DAM GATE*\n\nStatus: *${g}*\nAngle: ${v(live?.gate?.angle, '°')}\nCountdown: ${isStale(live) ? 'NOT LIVE (stored countdown)' : g === 'COUNTDOWN' && Number.isFinite(cd) && cd > 0 ? `${cd} seconds` : 'NOT ACTIVE'}\nReason: ${v(live?.gate?.reason)}\n\n${freshnessLine(live)}`;
  }

  if (['rain', 'rainfall'].includes(c)) {
    if (!rainInstalled(live)) {
      return `🌧️ *RAINFALL*\n\n${freshnessLine(live)}\n\nRain Gauge: *${normalizeDevice(live?.devices?.rainGauge)}*\n\nReal collector sensor data is currently unavailable. No rainfall value is fabricated.`;
    }
    const depth = live?.rain?.waterDepthCm;
    const raw = live?.rain?.rawValue;
    const limited = live?.rain?.calibrationLimited === true;
    const weight = live?.rain?.weightGrams;
    return `🌧️ *RAINFALL*\n\nCurrent: ${v(live?.rain?.currentMm, ' mm')}\nAccumulated: ${v(live?.rain?.dailyMm, ' mm')}\nCategory: ${v(live?.rain?.status)}\nCollector depth: ${v(depth, ' cm')}\nSensor RAW: ${v(raw)}\nGauge weight: ${weight == null ? 'Unavailable (no load cell)' : v(weight, ' g')}\nCalibration: ${limited ? 'LIMITED - highest calibrated depth reached' : 'OK'}\n\n${freshnessLine(live)}`;
  }

  if (['devices', 'health'].includes(c)) {
    return `🔧 *${isStale(live) ? 'LAST REPORTED DEVICE HEALTH' : 'DEVICE HEALTH'}*\n\n${freshnessLine(live)}\n\n${deviceLines(live)}\n\n💾 MicroSD: NOT INSTALLED\n📱 GSM: NOT INSTALLED`;
  }

  if (['network', 'esp', 'wifi'].includes(c)) {
    return `📶 *ESP8266 NETWORK*\n\nStatus: ${normalizeDevice(live?.esp8266?.status)}\nConnection: ${v(live?.esp8266?.connection)}\nSignal: ${v(live?.esp8266?.rssi, ' dBm')}\n\n${freshnessLine(live)}`;
  }

  if (['emergency', 'alarm'].includes(c)) {
    return `🚨 *${isStale(live) ? 'LAST RECORDED ALARM STATUS' : 'EMERGENCY STATUS'}*\n\n${freshnessLine(live)}\n\nAlarm: ${boolText(live?.alarm?.active)}\nType: ${v(live?.alarm?.type)}\nRisk: *${risk(live)}*\nWater: *${level(live)}*\nGate: *${normalizeGate(live)}*`;
  }

  return `❓ Unknown command: *${c || '(empty)'}*\n\nSend *menu* to see FloodGuard commands.`;
}

async function sendAll(sock, text) {
  const subscribers = [...getSubscribers()];
  let failures = 0;
  for (const jid of subscribers) {
    try {
      await sock.sendMessage(jid, { text });
    } catch {
      failures += 1;
      // Never put subscriber IDs, thrown URLs or auth tokens into CI/host logs.
      console.error('FloodGuard alert delivery failed (details redacted)');
    }
  }
  return failures;
}

function opening(live) {
  return normalizeGate(live) === 'COUNTDOWN' && Number(live?.gate?.countdownSeconds) > 0;
}

function eventKey(prefix, live, extra = '') {
  // Based on state transition and source timestamp, not Date.now alone.
  const sourceTs = Number(live?.system?.lastUpdate) || 0;
  return `${prefix}:${sourceTs}:${extra}`;
}

// Serialize state transitions. Without this gate, overlapping Firebase SSE
// callbacks can read the same prior state, deliver duplicate DANGER alerts,
// and overwrite one another's saved transition state.
let alertProcessingTail = Promise.resolve();
function processLiveChange(sock, live) {
  const next = alertProcessingTail.then(() => processLiveChangeSerial(sock, live));
  // Keep later callbacks processable after any individual malformed event.
  // The caller still receives the original rejection for diagnostics.
  alertProcessingTail = next.catch(() => {});
  return next;
}

async function processLiveChangeSerial(sock, live) {
  if (!live) return;

  let currentLevel = level(live);
  const currentGate = normalizeGate(live);
  const countdown = Number(live?.gate?.countdownSeconds);
  const stale = isStale(live);
  const sourceAt = fieldTimeMs(live);
  let state = getState();
  // SSE children can reconnect and deliver valid observations out of order.
  // Serialize processing AND reject field timestamps older than the most
  // recent persisted observation to prevent false SAFE recovery.
  const lastSourceAt = Number.isFinite(state.lastSourceAt) ? state.lastSourceAt : 0;
  if (sourceAt !== null && sourceAt < lastSourceAt) return;
  // Preserve the previous confirmed danger/warning state if this update is
  // missing its physical reading; only verified measurements clear it.
  if (currentLevel === 'UNKNOWN' && waterLevelCm(live) === null &&
      ['WARNING', 'DANGER'].includes(state.level)) {
    currentLevel = state.level;
  }

  // Never generate safety alerts from stale snapshots.
  // We still update heartbeat metadata so the bot remains observable.
  if (stale) {
    saveState({ ...state, lastSourceAt: sourceAt ?? state.lastSourceAt,
      lastSeenAt: Date.now(), dataStale: true });
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
      lastSourceAt: sourceAt,
      dataStale: false
    });
    return;
  }

  // Persist an aggregate failure signal; this is not a retry or
  // confirmation that a remote device received earlier messages.
  let failedSends = 0;
  const sendAlert = async text => {
    failedSends += await sendAll(sock, text);
  };

  const previousLevel = state.level || 'UNKNOWN';
  const previousGate = state.gateStatus || 'UNKNOWN';
  let procedureId = state.procedureId || null;
  let sentCountdown = Array.isArray(state.sentCountdown) ? state.sentCountdown : [];
  let lastEventKey = state.lastEventKey || '';

  if (previousLevel !== currentLevel) {
    const key = eventKey('level', live, `${previousLevel}->${currentLevel}`);
    if (key !== lastEventKey) {
      if (currentLevel === 'WARNING') {
        await sendAlert( `🟡 *FLOODGUARD WARNING*\n\nWater has entered the warning zone.\n\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n💧 Status: WARNING\n🛡️ Risk: ${risk(live)}\n🚧 Gate: ${currentGate}`);
      } else if (currentLevel === 'DANGER') {
        await sendAlert( `🚨 *FLOODGUARD DANGER*\n\nCritical water level detected.\n\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n🔴 Water: DANGER\n🛡️ Risk: ${risk(live)}\n🚨 Alarm: ${boolText(live?.alarm?.active)}\n\nFloodGuard is monitoring the gate-opening sequence.`);
      } else if (currentLevel === 'SAFE' && ['WARNING', 'DANGER'].includes(previousLevel)) {
        await sendAlert( `✅ *FLOODGUARD RECOVERY*\n\nWater conditions have returned to SAFE.\n\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n🚧 Gate: ${currentGate}\n🛡️ Risk: ${risk(live)}`);
      } else if (currentLevel === 'SENSOR_ERROR') {
        await sendAlert( '⚠️ *FLOODGUARD SENSOR ALERT*\n\nThe water sensor is not providing a valid reading. FloodGuard will not fabricate a water level.');
      }
      lastEventKey = key;
    }
  }

  if (opening(live) && !procedureId) {
    procedureId = `gate-${Number(live?.system?.lastUpdate) || Date.now()}`;
    sentCountdown = [];
    await sendAlert( `🚨 *DAM GATE OPENING WARNING*\n\nThe DANGER condition has started the gate countdown.\n\n⏱️ Opening in: ${v(countdown, ' seconds')}\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n🚧 Gate: COUNTDOWN`);
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
        await sendAlert( `${title}\n\n⏱️ *${milestone} SECOND${milestone === 1 ? '' : 'S'}*\n\n🔴 Water: ${currentLevel}\n🚧 Gate: COUNTDOWN`);
        sentCountdown.push(milestone);
      }
    }
  }

  if (currentGate === 'OPEN' && previousGate !== 'OPEN') {
    await sendAlert( `🚧 *FLOODGUARD DAM GATE OPEN*\n\nThe prototype dam gate is OPEN.\n\n📐 Servo Angle: ${v(live?.gate?.angle, '°')}\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n🔴 Water: ${currentLevel}\n🛡️ Risk: ${risk(live)}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (procedureId && currentGate === 'CLOSED' && currentLevel !== 'DANGER') {
    await sendAlert( `✅ *GATE OPENING CANCELLED*\n\nThe countdown ended because the confirmed water state changed.\n\n🚧 Gate: CLOSED\n💧 Water: ${currentLevel}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (previousGate === 'OPEN' && currentGate === 'CLOSED') {
    await sendAlert( `🔒 *DAM GATE CLOSED*\n\nThe prototype gate has returned to 0°.\n\n💧 Water: ${currentLevel}\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}`);
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
    lastSourceAt: sourceAt,
    alertSendFailureCount:
      (Number.isSafeInteger(state.alertSendFailureCount) && state.alertSendFailureCount >= 0
        ? state.alertSendFailureCount : 0) + failedSends,
    deliveryDegraded: failedSends > 0 || state.deliveryDegraded === true,
    lastDeliveryFailureAt: failedSends > 0 ? Date.now() : state.lastDeliveryFailureAt,
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
  isStale,
  fieldTimeMs
};
