# FloodGuard offline Command Center — operator / interview guide

**Scope:** Synthetic, localhost-only browser experience extracted from legacy draft PR #12. No WhatsApp/Baileys connection, no Firebase RTDB access, no sensors, no hardware controls, no external assets and no delivery of alerts.

## Start on your PC

1. Use a supported patched Node.js 22 or 24 runtime and run `npm ci`, `npm run check`, `npm test`.
2. Create your own **untracked** `.env` based on `.env.example`. Populate only `FLOODGUARD_SETUP_TOKEN` with a long, random private value of at least 32 printable characters; `DEMO_PORT=8085` is optional. A random token can be generated with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; copy the result into the private file and do not commit the file or paste the value in issue threads.
3. Run `npm run start:demo`. Visit `http://127.0.0.1:8085` on the same computer, logging in as `admin` with your private token.
4. Choose OFFLINE, SAFE, WARNING, DANGER or STALE. Use the read-only chat preview to show how command responses might be presented. These are pre-defined fictional examples and cannot send any message.
5. Stop with Ctrl+C.

**The real bot is not started by this command.** No linking, session files or Firebase credentials are required. Never use live production accounts, secrets, private student identifiers or real disaster events as demo inputs.

## Threat boundaries and verification

- Listener and request authority are checked against loopback. Forged Host, nonlocal Origin and cross-site requests are rejected. Setup and demo endpoints require HTTP Basic authentication on loopback.
- HTML content is a static, local template with CSP hashes. Browser code uses DOM text insertion rather than arbitrary HTML interpolation; sensitive data is not held in browser storage.
- The underlying demo fixture source is deterministic and reports `deliveryEnabled=false` and `hardwareControlEnabled=false`. Unrecognized commands and scenarios return an error.
- `npm test` exercises synthetic endpoint authentication, negative cases, response headers, injection boundaries and offline fixture semantics. CI also runs on Node 22 and 24; **passing does not prove real-browser usability on every device**.
- The operator checklist is temporary, local presentation state. It is **not** authorization to deploy, turn on physical hardware or connect WhatsApp.
- If the demo cannot start, verify the private token and local port. Do not work around localhost restrictions by setting a public listener address.

## Automated real-browser verification (CI only)

The new `FloodGuard Offline Browser E2E` GitHub Actions workflow uses the Chrome binary provided by the Ubuntu 24.04 runner with patched Node.js 24.22.1. It records the exact browser version during each run. The workflow uses Node's built-in Chrome DevTools Protocol WebSocket, so it adds **no Puppeteer, Playwright, browser CDN or new npm dependency**. It starts an ephemeral authenticated demo bound strictly to `127.0.0.1`, uses a **synthetic-only** temporary admin token, and never starts `bot.js`.

The browser test checks initial disconnected hosting diagnostics, eight fictional sensor cards, synthetic DANGER and STALE scenario changes, synthetic read-only chat replies, clear/reset controls, the temporary acceptance checklist, skip-link focus visibility, and page overflow/action visibility at **375px phone-width, 768px tablet-width, and 1440px desktop-width**. It also rejects any attempted HTTP(S) request outside the demo's localhost origin. The browser process and its temporary profile are closed and removed when the test finishes.

To rerun in GitHub, open the `FloodGuard Offline Browser E2E` workflow and use **Run workflow** on a branch containing the test, or open a PR that changes relevant offline-demo files. `npm test` remains the separate Node.js unit/integration suite; it does **not** count these browser assertions toward Node's numbered test total.

**Limitations:** This exercises the Chromium engine and a moving Chrome release present on the CI runner—not a pinned browser build, accessibility certification, VoiceOver/TalkBack, Safari/Firefox, or an actual mobile device. It provides a pragmatic automated browser smoke and layout check, not a full WCAG audit. It does not verify real service availability, WhatsApp delivery, network failure, Firebase RTDB permission rules, or the physical flood-warning system.

## Distinguish demo from real system

| Capability | Offline demo | Real system |
|---|---|---|
| Fictional status cards and chat preview | Yes | Different live behavior |
| Firebase RTDB connection | No | Requires separately verified rules/connectivity |
| WhatsApp pairing and delivery | No | Requires a real authorized account and operator checks |
| Dam gate/servo movement | No | Controlled only by separate supervised hardware |
| Deployment/rollback readiness | Not tested | Requires its own verified procedure |
| Flood-warning safety certification | None | Not claimed |

The restored experience is an **interview demonstration of UI and test architecture**, not a live flood-warning service.
