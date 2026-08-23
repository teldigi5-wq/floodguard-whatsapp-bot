import { LiveData, Level } from "../types";
export const val = (v: unknown, suffix = "") =>
  v === undefined || v === null || v === "" ? "NOT AVAILABLE" : `${v}${suffix}`;

export function deriveLevel(live: LiveData | null): Level {
  const stated = live?.water?.status?.toUpperCase();
  if (stated === "SAFE" || stated === "WARNING" || stated === "DANGER") return stated;
  const d = live?.water?.distanceCm;
  if (typeof d !== "number" || !Number.isFinite(d)) return "UNKNOWN";
  if (d > 15) return "SAFE";
  if (d > 12) return "WARNING";
  return "DANGER";
}

export function stats(live: LiveData | null) {
  if (!live) return "🌊 *FLOODGUARD LIVE STATS*\n\nLive Firebase data is NOT AVAILABLE.";
  return `🌊 *FLOODGUARD LIVE STATS*

💧 Distance to Water: ${val(live.water?.distanceCm, " cm")}
💧 Water Status: ${val(live.water?.status)}

🛡 Flood Risk:
${val(live.system?.overallRisk)}

🚧 Dam Gate:
${val(live.gate?.status)}

📐 Gate Angle:
${val(live.gate?.angle, "°")}

🚨 Alarm:
${val(live.alarm?.active)}

📡 ESP8266:
${val(live.esp8266?.status)}

🕒 Last Update:
${val(live.system?.lastUpdate)}`;
}
