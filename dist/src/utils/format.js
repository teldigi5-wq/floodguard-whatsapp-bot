"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.val = void 0;
exports.deriveLevel = deriveLevel;
exports.stats = stats;
const val = (v, suffix = "") => v === undefined || v === null || v === "" ? "NOT AVAILABLE" : `${v}${suffix}`;
exports.val = val;
function deriveLevel(live) {
    const stated = live?.water?.status?.toUpperCase();
    if (stated === "SAFE" || stated === "WARNING" || stated === "DANGER")
        return stated;
    const d = live?.water?.distanceCm;
    if (typeof d !== "number" || !Number.isFinite(d))
        return "UNKNOWN";
    if (d > 15)
        return "SAFE";
    if (d > 12)
        return "WARNING";
    return "DANGER";
}
function stats(live) {
    if (!live)
        return "🌊 *FLOODGUARD LIVE STATS*\n\nLive Firebase data is NOT AVAILABLE.";
    return `🌊 *FLOODGUARD LIVE STATS*

💧 Distance to Water: ${(0, exports.val)(live.water?.distanceCm, " cm")}
💧 Water Status: ${(0, exports.val)(live.water?.status)}

🛡 Flood Risk:
${(0, exports.val)(live.system?.overallRisk)}

🚧 Dam Gate:
${(0, exports.val)(live.gate?.status)}

📐 Gate Angle:
${(0, exports.val)(live.gate?.angle, "°")}

🚨 Alarm:
${(0, exports.val)(live.alarm?.active)}

📡 ESP8266:
${(0, exports.val)(live.esp8266?.status)}

🕒 Last Update:
${(0, exports.val)(live.system?.lastUpdate)}`;
}
