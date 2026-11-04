# FloodGuard R3 H13 — unverified provenance on automated alert messages

**4 November 2026 · DRAFT / NONPRODUCTION / NO LIVE WHATSAPP / NO FIREBASE OR HARDWARE CHANGE / NO-GO.**
Stacked on verified bot PR #70 at `c4e356720aa3f4922914e553eba627dcb66efb3f`.

## Verified inconsistency

Bot H12 aligns *read-only replies* with Android's unverified legacy Firebase telemetry label. However, the existing `processLiveChangeSerial` **automated** alert path still says `Water conditions have returned to SAFE`, `Critical water level detected`, and `The DANGER condition has started the gate countdown` based on timestamps, numeric measurements, and unauthenticated Firebase child reads. There is no deployed H11 certificate consumer or independently durable source witness in the operational bot. A malicious or faulty database writer can produce plausible but false measurements and timestamps.

## Targeted correction

- Route every existing automated alert through one shared `SOURCE UNVERIFIED` notice appended inside the existing `sendAlert` wrapper. It explicitly states that sensor identity, field conditions, and gate position are not independently verified, and asks readers to follow the approved independent/manual safety procedure.
- Keep WARNING/DANGER and sensor-fault notifications active **in this draft's synthetic tests**. Their descriptive phrases now say `unsigned telemetry reports` and `possible` instead of implying independently detected physical truth.
- Replace the automatic SAFE recovery copy with `FLOODGUARD RECOVERY REPORT — NOT AN ALL-CLEAR`, state that unsigned sensor data merely *reports* SAFE, and explicitly say not to stand down independent warnings or checks until authorized field verification.
- Rephrase controller countdown copy to avoid claiming physical actuation.
- Preserve existing message dispatch triggers, fail-closed state-loss/recipient-loss handling, delivery-uncertainty fences, expiry, retry, and deduplication. No changes to subscriber storage, network transport, Firebase source selection, live sender initialization, firmware, or control interfaces.

### Evidence required for this draft

Run both patched Node 22.23.4 and 24.22.1 matrix jobs at the exact PR head. CI includes syntax, all active CommonJS tests, code coverage, and production `npm audit --omit=dev --audit-level=high`. Dedicated synthetic negative tests use a fake `sendMessage` and isolated state: warning, danger, false all-clear recovery, source-reported gate opening, sensor fault, and stale SAFE handling. These **never contact** WhatsApp, Firebase, a physical device, or a real recipient.

## Remaining serious blocker

**This is a communication-safety correction, not cryptographic containment.** The actual automatic dispatcher is still driven by **unsigned legacy Firebase telemetry**. Correct wording cannot prevent forged, lost, replayed, or maliciously manipulated warnings. A qualified engineering review must decide whether automated messages can be enabled at all until a deployed H11 certified consumer, independently controlled witness, authenticated signer/ingestion, revocation, and real hardware tests are accepted. A signed source also cannot alone prove physical sensor calibration or that recipients received messages.

Do not merge, deploy, send real messages, pair WhatsApp, restore AWS, alter Firebase rules, provision keys, flash firmware, or operate gate/alarm equipment on the authority of this PR. Real delivery and Android phone acceptance remain **unverified**. Production **NO-GO**.
