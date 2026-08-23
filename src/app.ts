import express from "express";
import crypto from "crypto";
import { config } from "./config";
import { commandReply } from "./commands";
import { sendText } from "./services/whatsappService";
import { monitorFloodGuard } from "./services/alertService";

export const app = express();

app.get("/health", (_req,res) => res.json({ status:"ok", service:"FloodGuard WhatsApp Bot" }));

app.get("/webhook", (req,res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// Capture raw bytes for Meta signature verification.
app.post("/webhook", express.raw({type:"application/json"}), async (req,res) => {
  try {
    if (config.metaAppSecret) {
      const sig = req.header("x-hub-signature-256") || "";
      const expected = "sha256=" + crypto.createHmac("sha256", config.metaAppSecret).update(req.body).digest("hex");
      const a = Buffer.from(sig), b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.sendStatus(401);
    }
    const body = JSON.parse(req.body.toString("utf8"));
    res.sendStatus(200); // acknowledge Meta quickly
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    for (const m of messages) {
      if (m.type !== "text") continue;
      const reply = await commandReply(m.from, m.text?.body || "");
      await sendText(m.from, reply);
    }
  } catch (e) { console.error(e); if (!res.headersSent) res.sendStatus(500); }
});

app.use(express.json());
app.post("/internal/monitor", async (_req,res) => {
  await monitorFloodGuard();
  res.json({ok:true});
});
