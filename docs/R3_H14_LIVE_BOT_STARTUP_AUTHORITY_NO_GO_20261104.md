# FloodGuard R3 H14 — active bot startup NO-GO gate

**4 November 2026 · DRAFT / UNMERGED / NOT DEPLOYABLE / NO-GO.**
Stacked on bot PR #71 `07ba2f69f573bf30b993fa7b4bb8225c45d83f0e`.

## Concrete threat and verified source boundary

The active CommonJS `bot.js` calls `start()` on load, pairs/recovers a WhatsApp session and connects Firebase. While H12–H13 honestly label unsigned telemetry, `stream.on('live')` can still run `processLiveChange(activeSock,live)`, which can call `sendAll` for automated alerts. The H11 independent signer/witness implementation remains a **synthetic website/emulator lab** and there is no production-trusted certificate, separately controlled witness, source-authenticated ESP8266 ingress, or accepted independent warning plan. An application that starts automatic alerts under those conditions cannot be represented as production-safe.

## Corrective scope (no fake authority)

- `src/operationalAuthority.js` provides a fixed immutable `NO_GO` decision with `operationalStartupAllowed:false`, `automaticAlertsAllowed:false`, `sourceIdentityAuthenticated:false`, `independentWitnessVerified:false`, and `approvedFallbackRecorded:false`. It has **no environment-variable or caller-controlled permit path**.
- The actual `bot.js` entrypoint checks this decision **before** loading dotenv, Baileys, Express, private DATA_PATH/session, Firebase, any HTTP listener or QR logic. It exits with code **78**, a fixed nonsecret error, and no filesystem/network changes. This prevents accidental activation *if this draft were installed as the active CommonJS bot*. It is **not** a distributed authorization mechanism.
- Offline subprocess tests invoke the real entrypoint in disposable directories and attempt environment flag overrides, including fake witness/approval values; no session folder or recipient state may be created. The existing syntax, 22/24 patched-Node tests, coverage and high-severity dependency audit remain mandatory.
- The synthetic CommonJS alert processor itself and all existing unit tests remain untouched. This is intentional: it preserves its historical behavior for review, while ensuring that the **active entrypoint cannot reach it** for live operation in this draft. The older TypeScript/serverless files and any other external deployments are outside the protection of `bot.js` and must be separately inventoried.

## Operator and public-safety impact

**This draft deliberately prevents the WhatsApp bot from starting. It must NOT be merged or deployed onto a warning system currently relied upon by anyone.** A block that removes a functioning warning channel without an independently tested alternative can itself create danger. Maintain any currently approved independent warnings; if real flooding is suspected, use the site's emergency/manual warning procedures and qualified local responders.

This gate is not an endorsement to simply flip a boolean to `true`. Allowing startup later requires separate, reviewable delivery code backed by authenticated device ingress, externally held H11 certificate key and durable acknowledged witness, revocation and rollback protection, explicit operator-defined manual-warning fallback and tested real recipient delivery. A trusted-looking environment variable, service-account admin secret, timestamp, client-supplied public key, local emulator output or raw `DATABASE_CONFIRMED` cannot prove those properties.

## Acceptance and limitation

- Exact-head Node 22.23.4 and 24.22.1: syntax including `src/operationalAuthority.js`, all active CommonJS tests/coverage and `npm audit --omit=dev --audit-level=high`.
- No CI secrets, Firebase SDK, real device or WhatsApp QR are needed. A passing test establishes only that the checked-out CommonJS process stops early. It **cannot** prove any deployed process is stopped or a manual warning works.
- Deployment, Firebase Rules/IAM, phone pairing, messages, sensor keys, firmware, UNO gate/alarm and host change: **NOT AUTHORIZED / NOT EXECUTED**.
- Open real-world R3 release gates: effective Rules and IAM, signer/witness custody, durable confirmation, revocation and rollback-resistant recovery, field TLS and power recovery, cross-client delivery, supervised physical safety and owner authorization.

**NO-GO.**

## H14 follow-up — preflight/runtime freshness contract parity (4 November)

Independent code review found that the prior offline `inspectConfig` accepted
fractional values and up to `300000` milliseconds while the active alert
runtime accepts only **safe integers between 1000 and 60000 milliseconds**,
defaulting to 15000 when the variable is missing. This could produce a false
preflight PASS even though the runtime deliberately treats every observation as
STALE. The same existing draft now aligns the preflight with the runtime
without changing any runtime safety threshold, re-enabling bot startup or
modifying a production configuration. Synthetic boundary tests cover both
accepted endpoints, default/null, oversized, empty, fractional and invalid
inputs.

The mobile client uses a distinct 30-second freshness warning threshold.
That difference is not evidence of source authentication or a release gate.
Firmware timestamps and cross-client data propagation still require real
hardware and phone acceptance; no threshold was silently unified.
