# Synthetic alert outbox — virtual development stage

This document describes an **isolated, offline-only** development component. `src/virtualOutbox.js` is not imported by `bot.js`, the QR session, or the active `processLiveChange` delivery path. **The live service still has no durable retry/outbox implementation.** Do not claim this component provides guaranteed WhatsApp alerts, physical flood safety, or permission to deploy.

## What is implemented and tested

- Local JSON persistence with private file mode `0600`, temporary-file write, file sync, and same-directory rename; failed or corrupted records are rejected, not replaced silently.
- At most 128 pending per-recipient entries, 32 recipients per event, 256 retained event dedupe keys, 3 send attempts per entry, and maximum 15-second age/TTL.
- A caller must explicitly report a verified fresh observation, then separately supply a current subscriber allowlist and a fake send callback. Opening an outbox does **not** send anything. No internal timers, socket connections or WhatsApp imports.
- A newer source observation supersedes pending entries for its topic; old DANGER messages are not retried after SAFE. A changed/invalid/outdated observation fails closed.
- Simulated send errors are counted without logging exceptions or subscriber IDs. An accepted fake send is removed from the local pending list, and a rejected fake send is eligible for a bounded retry only while still fresh.
- A subscriber omitted from the current allowlist is removed from the pending queue. This supports revocation at retry time.
- Virtual tests cover replay prevention on restart, duplicate event keys, failed sends, expired/superseded events, malformed files, unauthorized recipients, queue overflow, and concurrent same-process drains.

Run `npm test` to exercise it as part of the Node.js 22/24 CI suite. No credentials, Firebase database or physical devices are needed.

## Explicit limitations before live integration

1. **Not production-wired.** Real flood alerts continue through the existing path. An operator must separately approve any real integration after additional CI and staged acceptance.
2. **No exactly-once or guaranteed delivery.** A crash after remote acceptance but before local acknowledgement can cause a duplicate retry. Promise resolution is not evidence a human received the message.
3. **Single-process only.** The virtual core protects against concurrent drains in one process but has no cross-process lock. Shared EC2/PC multi-worker use must be designed and tested before integration.
4. **No remote send timeout** or source authenticity mechanism in the core. It trusts the caller to provide a validated, fresh field observation. A hung send and a forged upstream state require separate safeguards.
5. **No power-loss durability certification.** File sync and rename reduce partial-file risk but cannot prove behavior under all filesystem or sudden-power-off conditions.
6. **Private identifiers stored locally.** Pending jobs include recipient addresses and text as plaintext in a `0600` local file, not encrypted. Never commit, upload, or display outbox files; protect disk, backups and operator permissions.
7. **Capacity refusal is explicit, not a delivery success.** A full queue throws without discarding existing jobs, requiring operator observation and a separate failure policy.

Next review: decide whether to add a source-verified, bounded orchestrator that integrates this core with alert transitions while preserving sender privacy, safe expiry, de-duplication and restart behavior. Add real-time stress simulations and negative-path logging/rollback tests before making any live change.

**Physical and real-account tests remain the operator's separate responsibility.**
