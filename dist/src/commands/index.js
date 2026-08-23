"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandReply = commandReply;
const firebaseService_1 = require("../services/firebaseService");
const format_1 = require("../utils/format");
const menu = `🌊 *FLOODGUARD*

Smart Flood Monitoring & Dam Gate Control System

Commands:

📊 stats
💧 water
🛡 risk
🚧 gate
🌧 rain
🔧 devices
🚨 emergency
🔔 subscribe
🔕 unsubscribe
❓ help

Send *stats* anytime to check the live water level.`;
async function commandReply(from, input) {
    const cmd = input.trim().toLowerCase().split(/\s+/)[0];
    if (["hi", "hello", "menu", "help"].includes(cmd))
        return menu;
    if (cmd === "subscribe") {
        await (0, firebaseService_1.addSubscriber)(from);
        return "🔔 *FLOODGUARD ALERTS ENABLED*\n\nYou are subscribed to automatic flood and dam-gate alerts.";
    }
    if (cmd === "unsubscribe") {
        await (0, firebaseService_1.removeSubscriber)(from);
        return "🔕 *FLOODGUARD ALERTS DISABLED*\n\nAutomatic alerts have been stopped.";
    }
    const live = await (0, firebaseService_1.getLive)();
    if (["stats", "status"].includes(cmd))
        return (0, format_1.stats)(live);
    if (!live)
        return "⚠️ FloodGuard live data is NOT AVAILABLE right now. No sensor value has been fabricated.";
    if (cmd === "water")
        return `💧 *WATER*\n\n📏 Distance to Water: ${(0, format_1.val)(live.water?.distanceCm, " cm")}\nStatus: ${(0, format_1.val)(live.water?.status)}\n\nSmaller distance means higher water.`;
    if (["risk", "flood"].includes(cmd))
        return `🛡 *FLOOD RISK*\n\nLevel: ${(0, format_1.val)(live.system?.overallRisk)}\nWater Status: ${(0, format_1.deriveLevel)(live)}`;
    if (cmd === "gate")
        return `🚧 *DAM GATE*\n\nStatus: ${(0, format_1.val)(live.gate?.status)}\nAngle: ${(0, format_1.val)(live.gate?.angle, "°")}\nCountdown: ${(0, format_1.val)(live.gate?.countdownSeconds, " s")}\nReason: ${(0, format_1.val)(live.gate?.reason)}`;
    if (["rain", "rainfall"].includes(cmd))
        return `🌧 *RAINFALL*\n\nStatus: ${(0, format_1.val)(live.rain?.status)}\nRainfall: ${(0, format_1.val)(live.rain?.rainfallMm, " mm")}`;
    if (["devices", "health"].includes(cmd))
        return `🔧 *DEVICE HEALTH*\n\nESP8266: ${(0, format_1.val)(live.esp8266?.status)}\nDevices: ${(0, format_1.val)(live.devices ? JSON.stringify(live.devices) : undefined)}`;
    if (["emergency", "alarm"].includes(cmd))
        return `🚨 *EMERGENCY STATUS*\n\nAlarm: ${(0, format_1.val)(live.alarm?.active)}\nRisk: ${(0, format_1.val)(live.system?.overallRisk)}\nWater: ${(0, format_1.deriveLevel)(live)}`;
    return `Unknown command: *${cmd}*\n\nSend *menu* to see FloodGuard commands.`;
}
