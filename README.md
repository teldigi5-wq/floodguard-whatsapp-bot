# FloodGuard WhatsApp Bot v3

Baileys + Firebase Realtime Database bot for the FloodGuard prototype.

## Live contract

Reads `/floodguard/live` and normalizes:
- Water: `SAFE`, `WARNING`, `DANGER`, `SENSOR_ERROR`
- Gate: `CLOSED`, `COUNTDOWN`, `OPEN`
- Device: `ONLINE`, `OFFLINE`, `UNKNOWN`, `NOT_INSTALLED`

Legacy `OPENING_WARNING` is accepted only as an input alias and normalized to `COUNTDOWN`.

## Commands

- `menu` / `help`
- `stats`
- `water`
- `risk`
- `gate`
- `devices`
- `rain`
- `emergency`
- `network`
- `subscribe`
- `unsubscribe`

## Automatic alerts

Subscribed users receive:
- WARNING transition
- DANGER transition
- gate countdown start
- countdown milestones at 10, 5, 3, 2, 1 seconds
- gate OPEN
- gate CLOSED after recovery
- SAFE recovery
- sensor-error notification

Stale Firebase snapshots are never used to generate safety alerts.

## Rain gauge

Rain gauge is treated as planned/not installed until `devices.rainGauge` becomes `ONLINE`. The bot will not fabricate rainfall values.

## Install / test

```bash
npm install
npm run check
npm start
```

Open port 8080 through your existing EC2/security-group setup if you use the QR status page remotely.

## PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 logs floodguard-whatsapp-bot --lines 50
```

If PM2 already has the process:

```bash
pm2 restart floodguard-whatsapp-bot
pm2 save
```

## Preserve WhatsApp login

Keep the existing `data/auth` folder when updating the bot. Deleting it forces a new QR scan.
