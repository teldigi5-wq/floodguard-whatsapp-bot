const { getSubscribers, subscribe, unsubscribe, getState, saveState } = require('./store');
const { assessDeliveryState } = require('./deliveryRecovery');

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
  // Controller state is NOT a physical proof. An old angle can contradict
  // a newer status when Firebase child updates arrive separately. Never
  // infer CLOSED from angle zero while the controller reports OPEN.
  const angle = sensorNumber(live?.gate?.angle);
  const countdown = sensorNumber(live?.gate?.countdownSeconds);
  const reported = upper(live?.gate?.status);
  const raw = reported === 'OPENING_WARNING' ? 'COUNTDOWN' : reported;
  const angleValid = angle !== null && Number.isInteger(angle) &&
    angle >= 0 && angle <= 90;
  const countdownValid = countdown === null ||
    (Number.isInteger(countdown) && countdown >= 0 && countdown <= 10);

  if (!countdownValid || (angle !== null && !angleValid)) return 'UNKNOWN';
  if (raw === 'COUNTDOWN') {
    return countdown !== null && countdown > 0 ? 'COUNTDOWN' : 'UNKNOWN';
  }
  // Positive countdown with an explicitly OPEN or CLOSED status indicates a
  // partial update; it is NOT a verified movement or countdown.
  if (countdown !== null && countdown > 0) return 'UNKNOWN';
  if (raw === 'OPEN') {
    return angleValid && angle >= 80 ? 'OPEN' : 'UNKNOWN';
  }
  if (raw === 'CLOSED') {
    return angleValid && angle <= 10 ? 'CLOSED' : 'UNKNOWN';
  }
  // Angle alone cannot establish a physical gate transition.
  return 'UNKNOWN';
}

function consistentGatePosition(live, target) {
  const angle = sensorNumber(live?.gate?.angle);
  const raw = upper(live?.gate?.status);
  if (angle === null || !Number.isInteger(angle) ||
      angle < 0 || angle > 90 ||
      normalizeGate(live) !== target) return false;
  if (target === 'OPEN') return raw === 'OPEN' && angle >= 80;
  if (target === 'CLOSED') return raw === 'CLOSED' && angle <= 10;
  return false;
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
  // The calibrated sensor-to-bottom height is an INSTALLATION property,
  // not the HC-SR04 manufacturer's maximum measurable distance (400 cm).
  // An air gap larger than this installation's height cannot establish SAFE.
  if (!Number.isFinite(WATER_SENSOR_TO_BOTTOM_CM) ||
      WATER_SENSOR_TO_BOTTOM_CM <= 0 ||
      WATER_SENSOR_TO_BOTTOM_CM > 400) return null;

  // An explicit sensor failure takes precedence over a plausible numeric
  // placeholder from an old Firebase child or partial multi-location PATCH.
  const health = upper(live?.water?.status);
  if (['SENSOR_ERROR', 'ERROR', 'INVALID', 'OFFLINE', 'UNAVAILABLE',
       'DISCONNECTED', 'NOT_INSTALLED', 'REMOVED'].includes(health)) return null;

  // HC-SR04 air gap is authoritative when present; never fall back to
  // levelCm after observing a corrupt or physically impossible distance.
  const distance = sensorNumber(live?.water?.distanceCm);
  if (live?.water != null && Object.hasOwn(live.water, 'distanceCm')) {
    if (distance === null || distance <= 0 ||
        distance > WATER_SENSOR_TO_BOTTOM_CM) return null;
    return WATER_SENSOR_TO_BOTTOM_CM - distance;
  }

  // Legacy level-only providers require equally bounded numeric evidence.
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
  const reported = upper(live?.system?.overallRisk);
  const water = level(live);
  // The independent, physically bounded water reading cannot coexist with
  // a LOWER overall-risk label carried by an older multi-location PATCH.
  // A trusted DANGER water level is CRITICAL, and WARNING is at least HIGH.
  if (water === 'DANGER') return 'CRITICAL';
  if (water === 'WARNING' &&
      !['HIGH', 'SEVERE', 'CRITICAL'].includes(reported)) return 'HIGH';

  // Neither stale time nor missing/failed water measurements can establish
  // LOW from an unverified backend text field. Preserve HIGH+ warnings.
  if ((isStale(live) ||
       water === 'UNKNOWN' || water === 'SENSOR_ERROR') &&
      ['LOW', 'MODERATE'].includes(reported)) return 'UNKNOWN';
  return ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'CRITICAL'].includes(reported)
    ? reported : 'UNKNOWN';
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
🔔 *subscribe* — request alert subscription
🔕 *unsubscribe* — automatic alerts OFF
❓ *help* — show this menu

Send *stats* anytime.`;

function deliveryNotice() {
  try {
    const health=assessDeliveryState(getState());
    if (health.automaticAlertsPaused) {
      return '\n\n🚫 *ALERT DELIVERY PAUSED*\nAutomatic warnings are paused after an uncertain send. Operator review and a manual warning fallback are required. Do not rely on automatic delivery.';
    }
    if (health.status==='DELIVERY_DEGRADED') {
      return '\n\n⚠️ *DELIVERY DEGRADED*\nSome automatic alert attempts failed. Recipient receipt has not been verified; use a manual warning if needed.';
    }
    if (health.status==='NOT_INITIALIZED') {
      return '\n\n⚠️ *ALERT DELIVERY STATUS UNKNOWN*\nNo verified alert-state baseline has been recorded. Do not rely on automatic delivery; use a manual warning and ask the operator to inspect local state.';
    }
    // A previously enrolled subscriber list might have disappeared while the
    // water-state record still looks normal. Never announce quiet delivery
    // health without verifying the local recipient registry is accessible.
    getSubscribers();
    return '';
  } catch {
    return '\n\n⚠️ *ALERT DELIVERY STATUS UNKNOWN*\nAutomatic warning delivery cannot be verified. Use a manual warning and ask the operator to inspect the private state.';
  }
}

function stats(live) {
  if (!live) return '⚠️ FloodGuard live data is NOT AVAILABLE.' + deliveryNotice();
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
🕒 Last Update: ${ageText(live)}${deliveryNotice()}`;
}

async function commandReply(jid, text, getLive) {
  const c = String(text || '').trim().toLowerCase().split(/\s+/)[0];

  if (['hi', 'hello', 'hey', 'menu', 'help', 'start'].includes(c)) return menu() + deliveryNotice();
  if (c === 'subscribe') {
    subscribe(jid);
    const notice=deliveryNotice();
    if (notice.includes('ALERT DELIVERY PAUSED') || notice.includes('STATUS UNKNOWN')) {
      return '🔔 *FLOODGUARD SUBSCRIPTION RECORDED*\n\nThis does not confirm that automated warning delivery is operating.' + notice;
    }
    return '🔔 *FLOODGUARD ALERTS ENABLED*\n\nAlerts are attempted on level changes, gate warnings and recovery; receipt is not guaranteed.' + notice;
  }
  if (c === 'unsubscribe') {
    unsubscribe(jid);
    return '🔕 *FLOODGUARD ALERTS DISABLED*\n\nAutomatic FloodGuard alerts have been stopped.' + deliveryNotice();
  }

  let live;
  try {
    live = await getLive();
  } catch (e) {
    // Never send transport errors, private URLs or auth material to WhatsApp.
    return '⚠️ *FIREBASE NOT AVAILABLE*\n\nTelemetry could not be retrieved. No sensor value has been fabricated.' + deliveryNotice();
  }

  if (['stats', 'status'].includes(c)) return stats(live);
  if (!live) return '⚠️ FloodGuard live data is NOT AVAILABLE right now.' + deliveryNotice();

  if (c === 'water') {
    return `💧 *WATER LEVEL*\n\n${freshnessLine(live)}\n💧 Actual Level: ${v(waterLevelCm(live), ' cm')}\n📏 HC-SR04 Air Gap: ${v(live?.water?.distanceCm, ' cm')}\nStatus: *${level(live)}*\n\nRules: SAFE <8.5 cm · WARNING 8.5–<11 cm · DANGER ≥11 cm.${deliveryNotice()}`;
  }

  if (['risk', 'flood'].includes(c)) {
    return `🛡️ *FLOOD RISK*\n\n${freshnessLine(live)}\nOverall Risk: *${risk(live)}*\nWater Status: ${level(live)}\nAlarm: ${boolText(live?.alarm?.active)}${deliveryNotice()}`;
  }

  if (c === 'gate') {
    const g = normalizeGate(live);
    const cd = Number(live?.gate?.countdownSeconds);
    return `🚧 *DAM GATE*\n\nStatus: *${g}*\nAngle: ${v(live?.gate?.angle, '°')}\nCountdown: ${isStale(live) ? 'NOT LIVE (stored countdown)' : g === 'COUNTDOWN' && Number.isFinite(cd) && cd > 0 ? `${cd} seconds` : 'NOT ACTIVE'}\nReason: ${v(live?.gate?.reason)}\n\n${freshnessLine(live)}${deliveryNotice()}`;
  }

  if (['rain', 'rainfall'].includes(c)) {
    if (!rainInstalled(live)) {
      return `🌧️ *RAINFALL*\n\n${freshnessLine(live)}\n\nRain Gauge: *${normalizeDevice(live?.devices?.rainGauge)}*\n\nReal collector sensor data is currently unavailable. No rainfall value is fabricated.${deliveryNotice()}`;
    }
    const depth = live?.rain?.waterDepthCm;
    const raw = live?.rain?.rawValue;
    const limited = live?.rain?.calibrationLimited === true;
    const weight = live?.rain?.weightGrams;
    return `🌧️ *RAINFALL*\n\nCurrent: ${v(live?.rain?.currentMm, ' mm')}\nAccumulated: ${v(live?.rain?.dailyMm, ' mm')}\nCategory: ${v(live?.rain?.status)}\nCollector depth: ${v(depth, ' cm')}\nSensor RAW: ${v(raw)}\nGauge weight: ${weight == null ? 'Unavailable (no load cell)' : v(weight, ' g')}\nCalibration: ${limited ? 'LIMITED - highest calibrated depth reached' : 'OK'}\n\n${freshnessLine(live)}${deliveryNotice()}`;
  }

  if (['devices', 'health'].includes(c)) {
    return `🔧 *${isStale(live) ? 'LAST REPORTED DEVICE HEALTH' : 'DEVICE HEALTH'}*\n\n${freshnessLine(live)}\n\n${deviceLines(live)}\n\n💾 MicroSD: NOT INSTALLED\n📱 GSM: NOT INSTALLED${deliveryNotice()}`;
  }

  if (['network', 'esp', 'wifi'].includes(c)) {
    return `📶 *ESP8266 NETWORK*\n\nStatus: ${normalizeDevice(live?.esp8266?.status)}\nConnection: ${v(live?.esp8266?.connection)}\nSignal: ${v(live?.esp8266?.rssi, ' dBm')}\n\n${freshnessLine(live)}${deliveryNotice()}`;
  }

  if (['emergency', 'alarm'].includes(c)) {
    return `🚨 *${isStale(live) ? 'LAST RECORDED ALARM STATUS' : 'EMERGENCY STATUS'}*\n\n${freshnessLine(live)}\n\nAlarm: ${boolText(live?.alarm?.active)}\nType: ${v(live?.alarm?.type)}\nRisk: *${risk(live)}*\nWater: *${level(live)}*\nGate: *${normalizeGate(live)}*${deliveryNotice()}`;
  }

  return `❓ Unknown command: *${c || '(empty)'}*\n\nSend *menu* to see FloodGuard commands.${deliveryNotice()}`;
}

async function sendAll(sock, text) {
  // A stuck send can hold the serialized transition processor indefinitely.
  // This only bounds our local wait; it cannot retract a WhatsApp message
  // already accepted by the transport or cancel remote side effects.
  const timeoutMs = Number(process.env.FLOODGUARD_SEND_TIMEOUT_MS ?? 5000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 30000) {
    throw new Error('Invalid FloodGuard send timeout policy');
  }
  const subscribers = [...getSubscribers()];
  let failures = 0;
  for (const jid of subscribers) {
    // The canonical alert state may have vanished or become quarantined after
    // an earlier recipient was contacted. Check before EACH next external send
    // so a partial batch cannot silently continue after lost local evidence.
    const recorded = getState();
    if (recorded.initialized !== true || recorded.deliveryUncertain === true) {
      throw new Error('FloodGuard alert state not eligible for delivery; manual recovery required');
    }
    // Revalidate durable subscriber consent/record integrity before EACH
    // recipient. A missing list must not become a silent empty enrollment,
    // and an unsubscribe during a prior send takes effect immediately.
    if (!getSubscribers().has(jid)) continue;
    let timer;
    try {
      // Invoke promptly; rejected/synchronous errors have known failure
      // semantics in this adapter. A timeout is ambiguous and must stop.
      let pending;
      try { pending = Promise.resolve(sock.sendMessage(jid, { text })); }
      catch { pending = Promise.reject(new Error('FloodGuard transport rejected send')); }
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve('timed-out'), timeoutMs);
      });
      const result = await Promise.race([
        pending.then(() => 'accepted', () => 'rejected'),
        timeout
      ]);
      if (result === 'timed-out') {
        console.error('FloodGuard alert send timed out; delivery uncertain (details redacted)');
        return { failures: failures + 1, uncertain: true };
      }
      if (result === 'rejected') {
        failures += 1;
        // Never put subscriber IDs, thrown URLs or auth tokens into CI/host logs.
        console.error('FloodGuard alert delivery failed (details redacted)');
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  // Detect subscriber-store deletion or corruption during the final send,
  // even when there is no next recipient to trigger the loop guard.
  getSubscribers();
  return { failures, uncertain: false };
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

  // A later-arriving SSE patch may share the exact same field timestamp as
  // the last confirmed water reading. Such a contradictory snapshot is not
  // newer physical evidence for a reduction in flood severity. Preserve the
  // confirmed hazard until a strictly newer source timestamp is observed.
  // Same-clock escalations and independent gate updates are still permitted.
  const waterSeverity = { SAFE: 0, WARNING: 1, DANGER: 2 };
  if (sourceAt !== null && sourceAt === lastSourceAt &&
      Object.hasOwn(waterSeverity, state.level) &&
      Object.hasOwn(waterSeverity, currentLevel) &&
      waterSeverity[currentLevel] < waterSeverity[state.level]) return;

  // Never generate safety alerts from stale snapshots.
  // We still update heartbeat metadata so the bot remains observable.
  if (stale) {
    saveState({ ...state, lastSourceAt: sourceAt ?? state.lastSourceAt,
      lastSeenAt: Date.now(), dataStale: true });
    return;
  }

  // An earlier send may have been accepted remotely despite our timeout.
  // Keep observing sensor states, but do not dispatch further messages or
  // silently replay until the operator reviews the durable uncertainty.
  if (state.deliveryUncertain === true) {
    saveState({
      ...state, lastObservedLevel: currentLevel, lastSeenAt: Date.now(),
      lastSourceAt: sourceAt ?? state.lastSourceAt, dataStale: false,
      deliveryDegraded: true
    });
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
    const outcome = await sendAll(sock, text);
    failedSends += outcome.failures;
    if (outcome.uncertain) {
      const failedAt = Date.now();
      saveState({
        ...state, initialized: true, level: currentLevel,
        gateStatus: currentGate, lastObservedLevel: currentLevel,
        lastSeenAt: failedAt, lastSourceAt: sourceAt, dataStale: false,
        alertSendFailureCount:
          (Number.isSafeInteger(state.alertSendFailureCount) &&
           state.alertSendFailureCount >= 0 ? state.alertSendFailureCount : 0) +
          failedSends,
        deliveryUncertain: true, deliveryDegraded: true,
        lastDeliveryFailureAt: failedAt
      });
      // Do not continue later recipients/events after an ambiguous outcome.
      throw new Error('FloodGuard delivery outcome uncertain; manual recovery required');
    }
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

  if (currentGate === 'OPEN' && previousGate !== 'OPEN' &&
      consistentGatePosition(live, 'OPEN')) {
    await sendAlert( `🚧 *FLOODGUARD DAM GATE OPEN*\n\nController reports the prototype dam gate OPEN. Physical position is not independently verified.\n\n📐 Servo Angle: ${v(live?.gate?.angle, '°')}\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}\n🔴 Water: ${currentLevel}\n🛡️ Risk: ${risk(live)}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (procedureId && currentGate === 'CLOSED' && currentLevel !== 'DANGER' &&
      consistentGatePosition(live, 'CLOSED')) {
    await sendAlert( `✅ *GATE OPENING CANCELLED*\n\nThe controller reports CLOSED and the countdown has ended. Physical gate closure is not independently verified.\n\n🚧 Gate: CLOSED\n💧 Water: ${currentLevel}`);
    procedureId = null;
    sentCountdown = [];
  }

  if (previousGate === 'OPEN' && currentGate === 'CLOSED' &&
      consistentGatePosition(live, 'CLOSED')) {
    await sendAlert( `🔒 *DAM GATE CLOSED*\n\nController reports gate CLOSED near 0°. Physical closure is not independently verified.\n\n💧 Water: ${currentLevel}\n💧 Water Level: ${v(waterLevelCm(live), ' cm')}`);
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
  consistentGatePosition,
  normalizeDevice,
  level,
  waterLevelCm,
  risk,
  isStale,
  fieldTimeMs
};
