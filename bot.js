require('dotenv').config();
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { DATA_PATH } = require('./src/store');
const { getLive, streamLive } = require('./src/firebase');
const { commandReply, processLiveChange } = require('./src/floodguard');

fs.mkdirSync(DATA_PATH, { recursive: true });
const AUTH = path.join(DATA_PATH, 'auth');
fs.mkdirSync(AUTH, { recursive: true });

const PORT = Number(process.env.PORT || 8080);
const app = express();
let qr = null;
let wa = 'STARTING';
let fb = 'STARTING';
let num = null;
let stream = null;

app.get('/', (_req, res) => res.send(`<!doctype html>
<meta name="viewport" content="width=device-width">
<title>FloodGuard Bot</title>
<style>
body{font-family:system-ui,Arial;background:#07131d;color:#eaf7ff;display:grid;place-items:center;min-height:100vh;margin:0}.c{background:#0d2130;border:1px solid #1c4259;border-radius:24px;padding:32px;text-align:center;width:min(650px,88vw);box-shadow:0 25px 80px #0008}.s{display:inline-block;padding:8px 12px;margin:6px;background:#15384d;border-radius:30px}img{width:320px;max-width:90%;background:#fff;padding:12px;border-radius:18px}code{color:#8de7ff}
</style>
<div class="c"><h1>🌊 FloodGuard Bot</h1><div class="s">WhatsApp: ${wa}</div><div class="s">Firebase: ${fb}</div>${num ? `<p>${num}</p>` : ''}${qr ? `<img src="${qr}"><p>WhatsApp → Linked Devices → Link a Device</p>` : ''}<p>Commands: <code>menu</code> · <code>stats</code> · <code>gate</code> · <code>devices</code></p></div>`));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'FloodGuard WhatsApp Bot',
  whatsapp: wa,
  firebase: fb
}));

app.listen(PORT, '0.0.0.0', () => console.log(`Open http://localhost:${PORT}`));

function startFirebase(sock) {
  if (stream) return;
  stream = streamLive();
  stream.on('connected', () => {
    fb = 'CONNECTED';
    console.log('Firebase connected');
  });
  stream.on('error', e => {
    fb = 'RECONNECTING';
    console.error('Firebase:', e.message);
  });
  stream.on('live', live => processLiveChange(sock, live).catch(console.error));
}

const msgText = m =>
  m?.message?.conversation ||
  m?.message?.extendedTextMessage?.text ||
  m?.message?.imageMessage?.caption ||
  '';

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['FloodGuard', 'Chrome', '3.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async u => {
    if (u.qr) {
      wa = 'WAITING_FOR_QR_SCAN';
      qr = await QRCode.toDataURL(u.qr, { width: 360, margin: 2 });
      console.log(`QR ready: http://localhost:${PORT}`);
    }

    if (u.connection === 'open') {
      wa = 'CONNECTED';
      qr = null;
      num = sock.user?.id || null;
      console.log('WhatsApp connected', num);
      startFirebase(sock);
    }

    if (u.connection === 'close') {
      wa = 'DISCONNECTED';
      qr = null;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) setTimeout(start, 3000);
      else console.log('Logged out; remove data/auth only for a fresh login.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const m of messages) {
      if (!m?.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;
      const text = msgText(m).trim();
      if (!text) continue;

      try {
        const reply = await commandReply(jid, text, getLive);
        await sock.sendMessage(jid, { text: reply }, { quoted: m });
      } catch (e) {
        console.error('Command error:', e);
        await sock.sendMessage(jid, { text: '⚠️ FloodGuard bot could not process that request right now.' }, { quoted: m }).catch(() => {});
      }
    }
  });
}

start().catch(console.error);
