# Stage 4 — Offline Command Center security and operator acceptance

**Review-only. Not an accreditation or approval to activate a live flood-warning service.**
Primary branch: `security/allowlisted-firebase-telemetry-v1` on draft bot PR #12. 
Physical Arduino Uno / ESP8266 have already been flashed and previously worked; they are currently unavailable.

## Scope, evidence, and residual risk

| Boundary | Tested mitigation | Limitation |
| --- | --- | --- |
| Browser cross-site abuse / DNS rebinding | Demo validates the HTTP Host authority against the actual loopback listener port; untrusted `Origin` and `Sec-Fetch-Site` requests fail closed | Browser requests are not a substitute for host firewall, malware protection or a full adversarial penetration test |
| Credentials and private setup | Strong token + authenticated routes; no-store, frame, CORS, referrer and restrictive CSP headers | HTTP Basic is appropriate only on the same computer's loopback; no public proxy, tunnel or exposure is authorized |
| QR and live commands | Pairing endpoint returns 404; mutating verbs and real-command aliases are rejected; synthetic state is fixed | Real bot and authenticated Firebase uploads are separate work |
| Offline/stale integrity | Unavailable readings never become live, demo stays disconnected even in SAFE/DANGER fixtures | No sensor telemetry has been collected or calibrated in CI |
| Operator verification | Five manual checkboxes stored in page memory, reset on reload, never written or transmitted | Checking all boxes does **not** authorize deployment or prove real field safety |
| Accessibility and layout | Chromium viewport, keyboard, reduced-motion and axe checks in CI | Manual screen-reader and physical device acceptance is still required |
| Synthetic backup | Stage 3 temp fixture checksum/restore/restart verification | No real WhatsApp session, Firebase secret or encrypted backup has been restored |

## Operator acceptance checklist (local only)

Open `http://127.0.0.1:8085` after `npm run start:demo` and authenticating privately. Verify the **SIMULATION ONLY** banner, OFFLINE has no current readings, STALE has no current readings, chat responses are **NOT SENT**, and Hosting Settings says WhatsApp/Firebase are disconnected. Mark the five checkboxes only after observing the screen. They reset on refresh; the status always reads **No deployment approval granted**.

Stop the process with Ctrl+C. Do not run `npm run start:pc`, pair WhatsApp, operate a gate, connect hardware, restore real session data, or modify Firebase production rules.

## Firebase security migration — separate future approval

- **Phase A (privacy containment):** Website draft PR #8 has a staged, emulator-tested candidate that limits public reads of selected children. It has **not** been deployed; retaining anonymous parent writes is still a serious unresolved production risk. Do not publish it as a complete secure rule set.
- **Phase B (authenticated device writes):** Requires a separate identity/bootstrap design for the ESP8266 that can be safely implemented and tested without breaking already-flashed firmware. The current prototype must not be mistaken for deployed authenticated uploads.
- **Cross-client review:** Before release, confirm website, Flutter PR #1 and bot PR #12 compatibility; migrate away from anonymous writes using non-hardware test infrastructure; prepare backups, rollback, operational authorization and testing windows.
- **Privacy:** Keep the mobile repository private pending historical archive/security issue #3. Do not disclose private ESP network identifiers, WhatsApp sessions, credentials, tokens, Wi-Fi data or subscribers.

## Stage 4 quality gate

Use `npm run check`, `npm test`, Windows CI, Firebase Emulator contract and isolated Chromium QA. Record the exact tested HEAD, workflow results, accessibility and network testing limitations before deciding the next milestone. A successful draft PR is **not** a deployment permit.
