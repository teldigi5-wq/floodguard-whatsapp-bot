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
const { renderPage } = require('./src/webUi');

fs.mkdirSync(DATA_PATH, { recursive: true });
const AUTH = path.join(DATA_PATH, 'auth');
fs.mkdirSync(AUTH, { recursive: true });

const PORT = Number(process.env.PORT || 8080);
const app = express();

let qr = null;
let qrGeneratedAt = 0;
let qrVersion = 0;
let wa = 'STARTING';
let fb = 'STARTING';
let num = null;
let stream = null;
let lastError = null;

app.disable('x-powered-by');

app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderPage());
});

app.get('/status', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    status: 'ok',
    service: 'FloodGuard WhatsApp Bot',
    whatsapp: wa,
    firebase: fb,
    connectedNumber: num,
    qr,
    qrVersion,
    qrGeneratedAt,
    lastError
  });
});

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
    lastError = null;
    console.log('Firebase connected');
  });

  stream.on('error', e => {
    fb = 'RECONNECTING';
    lastError = `Firebase: ${e.message}`;
    console.error('Firebase:', e.message);
  });

  stream.on('live', live => processLiveChange(sock, live).catch(error => {
    lastError = `Alert processing: ${error.message}`;
    console.error(error);
  }));
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
    browser: ['FloodGuard', 'Chrome', '4.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async u => {
    if (u.qr) {
      try {
        wa = 'WAITING_FOR_QR_SCAN';
        qrGeneratedAt = Date.now();
        qrVersion += 1;
        qr = await QRCode.toDataURL(u.qr, {
          width: 440,
          margin: 2,
          errorCorrectionLevel: 'M'
        });
        lastError = null;
        console.log(`QR ready (v${qrVersion}): http://localhost:${PORT}`);
      } catch (error) {
        qr = null;
        lastError = `QR generation: ${error.message}`;
        console.error(lastError);
      }
    }

    if (u.connection === 'open') {
      wa = 'CONNECTED';
      qr = null;
      qrGeneratedAt = 0;
      num = sock.user?.id || null;
      lastError = null;
      console.log('WhatsApp connected', num);
      startFirebase(sock);
    }

    if (u.connection === 'close') {
      qr = null;
      qrGeneratedAt = 0;
      const code = u.lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      wa = loggedOut ? 'LOGGED_OUT' : 'DISCONNECTED';
      lastError = loggedOut
        ? 'WhatsApp logged out. A fresh link session is required.'
        : 'WhatsApp connection dropped. Reconnecting automatically…';

      if (!loggedOut) {
        console.log('WhatsApp disconnected; reconnecting in 3 seconds.');
        setTimeout(start, 3000);
      } else {
        console.log('WhatsApp logged out; clearing expired auth and generating a fresh QR automatically.');
        try {
          fs.rmSync(AUTH, { recursive: true, force: true });
          fs.mkdirSync(AUTH, { recursive: true });
        } catch (error) {
          console.error('Could not reset WhatsApp auth:', error);
        }
        setTimeout(start, 1800);
      }
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
        await sock.sendMessage(
          jid,
          { text: '⚠️ FloodGuard bot could not process that request right now.' },
          { quoted: m }
        ).catch(() => {});
      }
    }
  });
}

start().catch(error => {
  lastError = `Startup: ${error.message}`;
  console.error(error);
});
