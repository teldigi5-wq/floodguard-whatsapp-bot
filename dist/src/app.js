"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("./config");
const commands_1 = require("./commands");
const whatsappService_1 = require("./services/whatsappService");
const alertService_1 = require("./services/alertService");
exports.app = (0, express_1.default)();
exports.app.get("/health", (_req, res) => res.json({ status: "ok", service: "FloodGuard WhatsApp Bot" }));
exports.app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config_1.config.verifyToken)
        return res.status(200).send(challenge);
    return res.sendStatus(403);
});
// Capture raw bytes for Meta signature verification.
exports.app.post("/webhook", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    try {
        if (config_1.config.metaAppSecret) {
            const sig = req.header("x-hub-signature-256") || "";
            const expected = "sha256=" + crypto_1.default.createHmac("sha256", config_1.config.metaAppSecret).update(req.body).digest("hex");
            const a = Buffer.from(sig), b = Buffer.from(expected);
            if (a.length !== b.length || !crypto_1.default.timingSafeEqual(a, b))
                return res.sendStatus(401);
        }
        const body = JSON.parse(req.body.toString("utf8"));
        res.sendStatus(200); // acknowledge Meta quickly
        const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
        for (const m of messages) {
            if (m.type !== "text")
                continue;
            const reply = await (0, commands_1.commandReply)(m.from, m.text?.body || "");
            await (0, whatsappService_1.sendText)(m.from, reply);
        }
    }
    catch (e) {
        console.error(e);
        if (!res.headersSent)
            res.sendStatus(500);
    }
});
exports.app.use(express_1.default.json());
exports.app.post("/internal/monitor", async (_req, res) => {
    await (0, alertService_1.monitorFloodGuard)();
    res.json({ ok: true });
});
