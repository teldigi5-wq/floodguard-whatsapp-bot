import axios from "axios";
import { config } from "../config";

export async function sendText(to: string, body: string) {
  if (!config.whatsappToken || !config.phoneNumberId) throw new Error("WhatsApp credentials missing");
  await axios.post(
    `https://graph.facebook.com/v23.0/${config.phoneNumberId}/messages`,
    { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } },
    { headers: { Authorization: `Bearer ${config.whatsappToken}`, "Content-Type": "application/json" } }
  );
}

export async function broadcast(phones: string[], body: string) {
  const results = await Promise.allSettled(phones.map(p => sendText(p, body)));
  results.forEach((r, i) => { if (r.status === "rejected") console.error("Send failed", phones[i], r.reason); });
}
