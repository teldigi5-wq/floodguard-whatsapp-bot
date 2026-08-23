export interface LiveData {
  water?: { distanceCm?: number; status?: string };
  rain?: { [key: string]: unknown; status?: string; rainfallMm?: number };
  gate?: { status?: string; angle?: number; countdownSeconds?: number; reason?: string };
  alarm?: { active?: boolean | string };
  devices?: Record<string, unknown>;
  esp8266?: { status?: string };
  system?: { overallRisk?: string; lastUpdate?: string | number };
}
export type Level = "SAFE" | "WARNING" | "DANGER" | "UNKNOWN";
