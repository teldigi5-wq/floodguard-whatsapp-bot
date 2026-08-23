"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendText = sendText;
exports.broadcast = broadcast;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
async function sendText(to, body) {
    if (!config_1.config.whatsappToken || !config_1.config.phoneNumberId)
        throw new Error("WhatsApp credentials missing");
    await axios_1.default.post(`https://graph.facebook.com/v23.0/${config_1.config.phoneNumberId}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }, { headers: { Authorization: `Bearer ${config_1.config.whatsappToken}`, "Content-Type": "application/json" } });
}
async function broadcast(phones, body) {
    const results = await Promise.allSettled(phones.map(p => sendText(p, body)));
    results.forEach((r, i) => { if (r.status === "rejected")
        console.error("Send failed", phones[i], r.reason); });
}
