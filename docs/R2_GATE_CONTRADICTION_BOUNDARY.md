# R2 — Contradictory gate telemetry and false closure prevention

**Draft-only correction in FloodGuard bot PR #67. No hardware actuation, WhatsApp delivery, Firebase mutation, or production deployment.**

## Problem

The bot previously prioritized a servo angle over the controller's gate status. A near-zero angle could therefore override a reported `OPEN` with `CLOSED`, and an old 90-degree angle could override a reported `CLOSED` with `OPEN` when separate Firebase children were updated at different times. That contradictory data could produce a misleading `DAM GATE CLOSED`, `DAM GATE OPEN` or `GATE OPENING CANCELLED` message. A missing position could also be treated as a known OPEN/CLOSED state on the strength of text alone.

## Behavior now

- `normalizeGate` accepts OPEN only with an integral, calibrated 80–90° position and matching OPEN status; CLOSED requires an integral 0–10° position and matching CLOSED status; controller-reported countdown requires a bounded positive countdown and suitable countdown status. These are **report-consistency checks**, not proof of physical movement.
- Contradictory or missing position and status, nonfinite or fractional angles, unsupported status, implausible angle/countdown, and positive countdown alongside OPEN or CLOSED all produce **UNKNOWN**. Angle-only telemetry cannot infer OPEN or CLOSED. Historical status-only replies are intentionally less confident.
- An automatic gate OPEN, CLOSED, or countdown-cancellation notification requires a matching controller status and bounded compatible position; it cannot be triggered by an old servo angle alone. Existing water-danger warnings are independent of this decision.
- Notification bodies explicitly say that the **controller reports** the gate state and that the physical position is **not independently verified**. The bot never issues gate commands.
- An UNKNOWN update does not assert a false closure. A later valid CLOSED value is not assumed to resolve a missing prior position/event identity; manual review remains necessary if the transition history is uncertain.

## Offline evidence

`tests/gate-contradictory-state.test.js` tests inconsistent OPEN/CLOSED pairs, missing/invalid positions, countdown contradictions, real bounded combinations, false CLOSED notifications, false cancellation during an unverified gate update, and a later matching CLOSED report. Existing tests expecting status-only OPEN to be physical position were updated to expect UNKNOWN. All tests use a fake socket and isolated synthetic state; no real contacts, Firebase, or hardware are used.

This does **not** provide actuator feedback, independent open/closed limit switches, cryptographic evidence that the source is the true gate controller, or verified receipt of messages. The live Firebase Rules and actual ESP8266/Arduino firmware are not proven safe. Treat valid model output as **controller-reported** only. Physical commissioning must verify gate limit switches, calibration, safe failure modes, authorized overrides and independent supervision. The outstanding zero-air-gap disagreement between bot and Flutter remains unresolved until hardware evidence is collected.

**Production remains NO-GO.** No protected main merge or live operation was performed.
