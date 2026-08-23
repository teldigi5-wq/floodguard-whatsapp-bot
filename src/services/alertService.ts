import { broadcast } from "./whatsappService";
import { claimEvent, getBotState, getLive, getSubscribers, setBotState } from "./firebaseService";
import { deriveLevel, val } from "../utils/format";
import { scheduleCountdown } from "./schedulerService";

async function once(id: string, text: string) {
  if (!(await claimEvent(id))) return;
  await broadcast(await getSubscribers(), text);
}

export async function monitorFloodGuard() {
  const live = await getLive();
  if (!live) return;
  const level = deriveLevel(live);
  const state = await getBotState();
  const prev = state.level as string | undefined;
  const gate = (live.gate?.status || "UNKNOWN").toUpperCase();
  const prevGate = (state.gateStatus || "UNKNOWN").toUpperCase();

  if (prev && prev !== level) {
    if (level === "WARNING") await once(`level-WARNING-${Date.now()}`,
      `🟡 *FLOODGUARD WARNING*\n\n⚠️ Water level is rising.\n\n📏 Distance to Water: ${val(live.water?.distanceCm," cm")}\n💧 Status: WARNING\n🛡 Flood Risk: ${val(live.system?.overallRisk)}\n🚧 Dam Gate: CLOSED\n\nFloodGuard is monitoring the situation.`);
    if (level === "DANGER") await once(`level-DANGER-${Date.now()}`,
      `🚨🚨 *FLOODGUARD DANGER* 🚨🚨\n\nCritical water level detected.\n\n📏 Distance to Water: ${val(live.water?.distanceCm," cm")}\n🔴 Status: DANGER\n🛡 Flood Risk: ${val(live.system?.overallRisk)}\n🚨 Alarm: ${val(live.alarm?.active)}\n\nDam gate opening procedure is being initiated.`);
    if (level === "SAFE") await once(`level-SAFE-${Date.now()}`,
      prev === "DANGER" || prev === "WARNING"
      ? `✅ *FLOODGUARD RECOVERY*\n\nWater conditions have returned to the safe level.\n\n💧 Status: SAFE\n📏 Distance: ${val(live.water?.distanceCm," cm")}\n🚧 Dam Gate: ${val(live.gate?.status)}\n🛡 Flood Risk: ${val(live.system?.overallRisk)}`
      : `🟢 *FLOODGUARD SAFE*\n\nWater conditions are currently safe.\n\n📏 Distance to Water: ${val(live.water?.distanceCm," cm")}\n💧 Status: SAFE\n🛡 Flood Risk: ${val(live.system?.overallRisk)}\n🚧 Dam Gate: ${val(live.gate?.status)}`);
  }

  const countdown = live.gate?.countdownSeconds;
  const opening = gate.includes("OPENING") || (level === "DANGER" && gate === "CLOSED" && typeof countdown === "number" && countdown > 0);
  if (opening && !state.procedureId) {
    const procedureId = `${Date.now()}`;
    await setBotState({ procedureId, countdownStart: countdown || 0 });
    await once(`gate-start-${procedureId}`,
      `🚨 *DAM GATE OPENING WARNING*\n\nDangerous water level detected.\n\n🚧 Dam Gate: ${val(live.gate?.status)}\n⏱ Gate opening in: ${val(countdown," seconds")}\n📏 Water Distance: ${val(live.water?.distanceCm," cm")}`);
    if (typeof countdown === "number") {
      for (const m of [20,10,5,3,2,1]) {
        if (countdown > m) await scheduleCountdown(countdown - m, m, procedureId);
      }
    }
  }

  if (gate === "OPEN" && prevGate !== "OPEN") {
    await once(`gate-open-${Date.now()}`,
      `🚧 *FLOODGUARD DAM GATE OPEN*\n\nThe dam gate has opened.\n\n📐 Gate Angle: ${val(live.gate?.angle,"°")}\n📏 Water Distance: ${val(live.water?.distanceCm," cm")}\n🔴 Water Status: ${val(live.water?.status)}\n🛡 Flood Risk: ${val(live.system?.overallRisk)}`);
    await setBotState({ procedureId: null });
  }

  if (state.procedureId && prevGate.includes("OPENING") && gate === "CLOSED" && level !== "DANGER") {
    await once(`gate-cancel-${state.procedureId}`,
      `✅ *GATE OPENING CANCELLED*\n\nWater conditions have changed.\n\n🚧 Dam Gate: CLOSED\n💧 Water Status: ${level}`);
    await setBotState({ procedureId: null });
  }

  await setBotState({ level, gateStatus: gate, lastMonitorAt: Date.now() });
}

export async function sendCountdownMilestone(milestone: number, procedureId: string) {
  const live = await getLive();
  if (!live) return;
  const state = await getBotState();
  const gate = (live.gate?.status || "").toUpperCase();
  if (state.procedureId !== procedureId) return;
  if (gate === "OPEN" || deriveLevel(live) !== "DANGER") return;

  const actual = live.gate?.countdownSeconds;
  // Re-check source of truth: don't announce a milestone if Firebase is no longer near it.
  if (typeof actual === "number" && actual > milestone + 5) return;

  let title = "⚠️ *DAM GATE COUNTDOWN*";
  if (milestone === 10) title = "🚨 *DAM GATE OPENING SOON*";
  if (milestone === 5) title = "🚨 *FINAL GATE WARNING*";
  await once(`countdown-${procedureId}-${milestone}`,
    `${title}\n\n🚧 Gate opening in:\n\n⏱ *${milestone} SECONDS*\n\n🔴 Water Status: ${deriveLevel(live)}`);
}
