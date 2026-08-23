import { addSubscriber, getLive, removeSubscriber } from "../services/firebaseService";
import { deriveLevel, stats, val } from "../utils/format";

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

export async function commandReply(from: string, input: string): Promise<string> {
  const cmd = input.trim().toLowerCase().split(/\s+/)[0];
  if (["hi","hello","menu","help"].includes(cmd)) return menu;
  if (cmd === "subscribe") {
    await addSubscriber(from);
    return "🔔 *FLOODGUARD ALERTS ENABLED*\n\nYou are subscribed to automatic flood and dam-gate alerts.";
  }
  if (cmd === "unsubscribe") {
    await removeSubscriber(from);
    return "🔕 *FLOODGUARD ALERTS DISABLED*\n\nAutomatic alerts have been stopped.";
  }

  const live = await getLive();
  if (["stats","status"].includes(cmd)) return stats(live);
  if (!live) return "⚠️ FloodGuard live data is NOT AVAILABLE right now. No sensor value has been fabricated.";

  if (cmd === "water") return `💧 *WATER*\n\n📏 Distance to Water: ${val(live.water?.distanceCm," cm")}\nStatus: ${val(live.water?.status)}\n\nSmaller distance means higher water.`;
  if (["risk","flood"].includes(cmd)) return `🛡 *FLOOD RISK*\n\nLevel: ${val(live.system?.overallRisk)}\nWater Status: ${deriveLevel(live)}`;
  if (cmd === "gate") return `🚧 *DAM GATE*\n\nStatus: ${val(live.gate?.status)}\nAngle: ${val(live.gate?.angle,"°")}\nCountdown: ${val(live.gate?.countdownSeconds," s")}\nReason: ${val(live.gate?.reason)}`;
  if (["rain","rainfall"].includes(cmd)) return `🌧 *RAINFALL*\n\nStatus: ${val(live.rain?.status)}\nRainfall: ${val(live.rain?.rainfallMm," mm")}`;
  if (["devices","health"].includes(cmd)) return `🔧 *DEVICE HEALTH*\n\nESP8266: ${val(live.esp8266?.status)}\nDevices: ${val(live.devices ? JSON.stringify(live.devices) : undefined)}`;
  if (["emergency","alarm"].includes(cmd)) return `🚨 *EMERGENCY STATUS*\n\nAlarm: ${val(live.alarm?.active)}\nRisk: ${val(live.system?.overallRisk)}\nWater: ${deriveLevel(live)}`;
  return `Unknown command: *${cmd}*\n\nSend *menu* to see FloodGuard commands.`;
}
