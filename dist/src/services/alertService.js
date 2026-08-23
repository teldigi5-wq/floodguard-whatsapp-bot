"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorFloodGuard = monitorFloodGuard;
exports.sendCountdownMilestone = sendCountdownMilestone;
const whatsappService_1 = require("./whatsappService");
const firebaseService_1 = require("./firebaseService");
const format_1 = require("../utils/format");
const schedulerService_1 = require("./schedulerService");
async function once(id, text) {
    if (!(await (0, firebaseService_1.claimEvent)(id)))
        return;
    await (0, whatsappService_1.broadcast)(await (0, firebaseService_1.getSubscribers)(), text);
}
async function monitorFloodGuard() {
    const live = await (0, firebaseService_1.getLive)();
    if (!live)
        return;
    const level = (0, format_1.deriveLevel)(live);
    const state = await (0, firebaseService_1.getBotState)();
    const prev = state.level;
    const gate = (live.gate?.status || "UNKNOWN").toUpperCase();
    const prevGate = (state.gateStatus || "UNKNOWN").toUpperCase();
    if (prev && prev !== level) {
        if (level === "WARNING")
            await once(`level-WARNING-${Date.now()}`, `🟡 *FLOODGUARD WARNING*\n\n⚠️ Water level is rising.\n\n📏 Distance to Water: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\n💧 Status: WARNING\n🛡 Flood Risk: ${(0, format_1.val)(live.system?.overallRisk)}\n🚧 Dam Gate: CLOSED\n\nFloodGuard is monitoring the situation.`);
        if (level === "DANGER")
            await once(`level-DANGER-${Date.now()}`, `🚨🚨 *FLOODGUARD DANGER* 🚨🚨\n\nCritical water level detected.\n\n📏 Distance to Water: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\n🔴 Status: DANGER\n🛡 Flood Risk: ${(0, format_1.val)(live.system?.overallRisk)}\n🚨 Alarm: ${(0, format_1.val)(live.alarm?.active)}\n\nDam gate opening procedure is being initiated.`);
        if (level === "SAFE")
            await once(`level-SAFE-${Date.now()}`, prev === "DANGER" || prev === "WARNING"
                ? `✅ *FLOODGUARD RECOVERY*\n\nWater conditions have returned to the safe level.\n\n💧 Status: SAFE\n📏 Distance: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\n🚧 Dam Gate: ${(0, format_1.val)(live.gate?.status)}\n🛡 Flood Risk: ${(0, format_1.val)(live.system?.overallRisk)}`
                : `🟢 *FLOODGUARD SAFE*\n\nWater conditions are currently safe.\n\n📏 Distance to Water: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\n💧 Status: SAFE\n🛡 Flood Risk: ${(0, format_1.val)(live.system?.overallRisk)}\n🚧 Dam Gate: ${(0, format_1.val)(live.gate?.status)}`);
    }
    const countdown = live.gate?.countdownSeconds;
    const opening = gate.includes("OPENING") || (level === "DANGER" && gate === "CLOSED" && typeof countdown === "number" && countdown > 0);
    if (opening && !state.procedureId) {
        const procedureId = `${Date.now()}`;
        await (0, firebaseService_1.setBotState)({ procedureId, countdownStart: countdown || 0 });
        await once(`gate-start-${procedureId}`, `🚨 *DAM GATE OPENING WARNING*\n\nDangerous water level detected.\n\n🚧 Dam Gate: ${(0, format_1.val)(live.gate?.status)}\n⏱ Gate opening in: ${(0, format_1.val)(countdown, " seconds")}\n📏 Water Distance: ${(0, format_1.val)(live.water?.distanceCm, " cm")}`);
        if (typeof countdown === "number") {
            for (const m of [20, 10, 5, 3, 2, 1]) {
                if (countdown > m)
                    await (0, schedulerService_1.scheduleCountdown)(countdown - m, m, procedureId);
            }
        }
    }
    if (gate === "OPEN" && prevGate !== "OPEN") {
        await once(`gate-open-${Date.now()}`, `🚧 *FLOODGUARD DAM GATE OPEN*\n\nThe dam gate has opened.\n\n📐 Gate Angle: ${(0, format_1.val)(live.gate?.angle, "°")}\n📏 Water Distance: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\n🔴 Water Status: ${(0, format_1.val)(live.water?.status)}\n🛡 Flood Risk: ${(0, format_1.val)(live.system?.overallRisk)}`);
        await (0, firebaseService_1.setBotState)({ procedureId: null });
    }
    if (state.procedureId && prevGate.includes("OPENING") && gate === "CLOSED" && level !== "DANGER") {
        await once(`gate-cancel-${state.procedureId}`, `✅ *GATE OPENING CANCELLED*\n\nWater conditions have changed.\n\n🚧 Dam Gate: CLOSED\n💧 Water Status: ${level}`);
        await (0, firebaseService_1.setBotState)({ procedureId: null });
    }
    await (0, firebaseService_1.setBotState)({ level, gateStatus: gate, lastMonitorAt: Date.now() });
}
async function sendCountdownMilestone(milestone, procedureId) {
    const live = await (0, firebaseService_1.getLive)();
    if (!live)
        return;
    const state = await (0, firebaseService_1.getBotState)();
    const gate = (live.gate?.status || "").toUpperCase();
    if (state.procedureId !== procedureId)
        return;
    if (gate === "OPEN" || (0, format_1.deriveLevel)(live) !== "DANGER")
        return;
    const actual = live.gate?.countdownSeconds;
    // Re-check source of truth: don't announce a milestone if Firebase is no longer near it.
    if (typeof actual === "number" && actual > milestone + 5)
        return;
    let title = "⚠️ *DAM GATE COUNTDOWN*";
    if (milestone === 10)
        title = "🚨 *DAM GATE OPENING SOON*";
    if (milestone === 5)
        title = "🚨 *FINAL GATE WARNING*";
    await once(`countdown-${procedureId}-${milestone}`, `${title}\n\n🚧 Gate opening in:\n\n⏱ *${milestone} SECONDS*\n\n🔴 Water Status: ${(0, format_1.deriveLevel)(live)}`);
}
