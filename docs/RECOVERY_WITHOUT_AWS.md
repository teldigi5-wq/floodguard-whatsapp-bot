# FloodGuard WhatsApp bot — recovery without AWS
Last reviewed: 14 October 2026

## What is established

The owner reports the previous AWS host is no longer accessible and the bot no longer runs there. The **same bot previously worked when deployed**. The Arduino and ESP8266 have already been flashed, worked correctly, and are offline for remote testing. Their existing firmware and gate wiring are not part of this recovery. There is **no confirmed access** to the old EC2 instance, `/data/auth`, subscriber files or original service logs. Do not describe the bot as a code failure or claim that its old WhatsApp login is recoverable.

**Current state:** documentation and provider-independent code are staged in draft PR #12, not deployed. Existing legacy `.github/workflows/deploy.yml` targets inaccessible EC2 and must **not** be used as the recovery workflow.

## Critical requirements

- One running Node.js process (Node 20 or newer) and reliable outbound HTTPS/WebSocket access to WhatsApp/Baileys and Firebase RTDB; verify provider rules and account status first. This is an unofficial WhatsApp integration, so API compatibility and account availability cannot be guaranteed.
- **Durable local data directory:** `DATA_PATH` must be on storage that persists across restarts, updates and redeploys. It contains the Baileys `auth/` session and `subscribers.json` / `state.json`. Never commit, upload publicly, paste into chat, or include this data in CI artifacts.
- A **private** random `FLOODGUARD_SETUP_TOKEN` (at least 32 ASCII characters) for the QR/status UI. Access via loopback (`HOST=127.0.0.1`) or behind HTTPS TLS termination and a restricted network route. Do not expose raw port 8080 to the public internet or use Basic Auth over public HTTP.
- Single instance only, avoid launching two connected WhatsApp sockets with the same session or simultaneous modification of the same auth files.
- Hardware-independent validation: `npm ci`, `npm run check`, `npm test`. Fake data tests cannot certify live WhatsApp pairing or Firebase security.

## Option A — No-cost local PC recovery (when a PC is available)

1. Clone the reviewed bot repository after explicit approval and check out a reviewed commit. Do not switch to an untested draft just because it is recent.
2. Install Node.js 20+, then run `npm ci` and `npm test`.
3. Copy `.env.example` to a **private** `.env` file. Set `HOST=127.0.0.1`, `PORT=8080`, `DATA_PATH` to a persistent local directory, your existing Firebase RTDB origin, and a randomly generated strong `FLOODGUARD_SETUP_TOKEN`. Never paste the value into a GitHub issue or file.
4. With the original `auth` directory available **only if securely recovered**, restore it under the new `DATA_PATH/auth` with restrictive permissions; retain a private backup. Otherwise pair again by scanning a **new** QR from the authorized WhatsApp phone. No old session can be reconstructed from repository code.
5. Start `npm start` on the machine; verify local `http://127.0.0.1:8080/health` and the authenticated local setup page. Use an authorized browser only. The page serves a real QR only if WhatsApp requires relinking.
6. If continuous operation is desired and tested, use `npx pm2 start ecosystem.portable.config.js` from the repository root and verify there is only one bot process. On Windows, configure a user-approved login/startup mechanism separately; PM2 startup behavior is not guaranteed.
7. The PC must remain on, online, and able to reach WhatsApp/Firebase. This option is not always-on when the PC is powered off.

## Option B — Always-Free VM candidate

Oracle Cloud advertises Always Free compute options (subject to registration, quotas, region capacity, terms and availability). It is a **candidate**, not an approved or guaranteed free 24/7 deployment. Before provisioning, confirm that a free VM is available and that using it will not incur charges. Do not create an account or infrastructure without owner action.

On an approved VM, repeat the same Node/PM2 and persistent-data workflow. Keep `HOST=127.0.0.1` and connect the setup page only via authenticated SSH tunnel or a properly configured HTTPS reverse proxy. Create an operator backup of auth state; do not store it in GitHub. Configure autostart, disk health, service monitoring, and firewall through a supervised admin session.

## Unsuitable apparent shortcuts

- Render **Free** web services can spin down after 15 minutes of idle inbound activity and have **ephemeral local storage**. A WhatsApp Baileys session stored as files might be lost on restart or redeployment; do not claim reliable unattended hosting on this tier.
- Railway Free has limited monthly credit; a persistently running bot and volume are not guaranteed to remain within zero-cost usage.
- GitHub Actions cron jobs or stateless serverless functions are not appropriate replacements for the long-lived WhatsApp socket and local auth state. Avoid repeatedly relinking the phone.

Official cost/limitation reference pages (verify again before creating accounts): https://render.com/docs/free , https://docs.railway.com/pricing/free-trial , https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Recovery decision matrix

| Condition | Next step |
| --- | --- |
| legacy AWS host remains unavailable; no /data backup | Treat WhatsApp session as **not recoverable yet**; plan fresh QR pairing. |
| Private secure backup of previous /data/auth exists | Restore to durable volume and test, but do not assume it is still authenticated. |
| No PC available and no approved cloud VM | Keep bot **offline** while maintaining tested source; web/mobile continue independently. |
| New host becomes available | Deploy once after explicit approval, confirm WhatsApp response and fallback, record rollback SHA and storage location. |
| Firebase Phase A access rules not yet deployed | Do not claim production Firebase private read/write exposure fixed by moving the bot. |

## What NOT to do

Do not reflash working Arduino/ESP8266 firmware. Do not change the physical servo, gate, Firebase production rules, or users' WhatsApp subscription state to solve an AWS ban. Do not promise 24/7 free hosting, fabricate a deployed bot, bypass a provider suspension, expose private QR or session files, or merge the production bot PR before the host and access path are tested.

### Release gate

The new host, operator access mechanism, and availability of a WhatsApp-capable phone must be confirmed before selecting a deployment provider. The migration is a new supervised deployment, not a resurrection of the banned EC2 instance.
