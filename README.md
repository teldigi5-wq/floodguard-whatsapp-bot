# FloodGuard WhatsApp Bot — EC2 + QR

Uses Baileys, Express, QR login, Firebase RTDB event streaming, PM2 and AWS EC2.

## Local Windows
```powershell
npm install
copy .env.example .env
npm run check
npm start
```
Open http://localhost:8080 and scan with WhatsApp → Linked Devices.

Then send:
- menu
- stats
- water
- risk
- gate
- rain
- devices
- emergency
- subscribe
- unsubscribe

Firebase stays at `/floodguard/live`. `distanceCm` means distance to water, not water depth.

Alerts are transition-based. Countdown messages use the real Firebase `gate.countdownSeconds`; the bot does not create an independent countdown.

## EC2
Amazon Linux 2023, Node 20, PM2, one instance. Open SSH 22 from your IP and TCP 8080 from your IP while scanning the QR.

```bash
chmod +x setup.sh
REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO.git ./setup.sh
pm2 startup
pm2 save
```

Baileys uses the WhatsApp linked-device/web protocol, not the official Meta Cloud API.
