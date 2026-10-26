# Virtual sensor-to-outbox contract — isolated QA

This module is **offline and not wired to the real FloodGuard WhatsApp bot**. `src/virtualAlertPlanner.js` maps synthetic, fresh water measurements onto a candidate event format accepted by `src/virtualOutbox.js`. It does **not** send alerts or read subscriber lists. No AWS, Firebase production, physical Arduino/ESP8266, WhatsApp account, or QR pairing was accessed for its tests.

## Trusted inputs and safe outputs

- Use `planVirtualWaterSnapshot({live, previous, now})` with an explicit local timestamp `now` in milliseconds when reproducible tests are needed.
- Require a physically plausible HC-SR04 air-gap measurement `0 < distanceCm <= 400`, numeric or numeric text, and a trustworthy timestamp no more than 15 seconds old. Missing, null, out-of-range, future-dated or incorrectly formatted observations are rejected with fixed non-sensitive reason codes.
- Reuse the active `src/floodguard.js` water-level classification: a valid physical distance overrides a contradictory stale backend status. Do not turn a backend-only `SAFE` label into a recovery.
- First valid reading initializes a verified observation without sending an invented alert.
- Newer verified SAFE, WARNING and DANGER transitions have deterministic, bounded, explicitly **SYNTHETIC** messages, stable event keys and a 7-second event TTL. Repeated same-level or out-of-order events do not generate new alerts.
- Passing a new SAFE observation to the isolated outbox supersedes undelivered older DANGER jobs. A warning already accepted by a remote system cannot be recalled.
- The planner deliberately does not package real recipients. Synthetic tests provide fictional JIDs and fake sender callbacks.

## Safety and deployment boundaries

**This is only a test contract, not a real notification system.** It does not authenticate Firebase telemetry, implement live outbox integration, guarantee WhatsApp delivery, prove hardware readings, validate production RTDB rules or protect against compromised sensors.

Before live integration, review source authenticity, actual account/sender failure classification, deduplicated event transition state, safely restricted subscriber authorization, device-level thresholds and a manual fallback for delivery failure. Preserve the exclusive outbox owner gate, uncertainty quarantine and stale-message expiry. Explicit operator approval and device/account acceptance are required before deployment.

The production `bot.js` must not import this module by default. Keep the isolated QA boundary until all remaining issue #35 gates pass.
