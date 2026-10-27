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

## In-flight safety boundary

The virtual drain checks exclusive ownership and the latest accepted field observation before continuing each queued recipient. If a newer SAFE observation supersedes DANGER during a slow synthetic send, already-dispatched work cannot be recalled, but **remaining queued recipients must not receive the old DANGER warning**. Dispatch begins immediately after the freshness check rather than yielding to another microtask first.

An exclusive owner's `close()` refuses to release the lock while a drain is active. If ownership is lost during a slow send (for example, a manual operator removes the lock), the original worker fails before persisting further results or sending subsequent jobs. These are virtual safety gates, **not guarantees of actual delivery or cancellation once a remote send has begun**.

## Private-storage failure quarantine

Synthetic filesystem fault injection now covers a partially written private outbox record (ENOSPC), failed file synchronization (EIO), denied same-directory rename (EROFS) and refused creation of the staging file. The previous successfully committed JSON remains authoritative; a failed write attempts to remove its unique, owner-only staging file and reports only a fixed non-sensitive error.

After a persistence failure, the current virtual outbox instance enters a **sticky storage-fault state**. It refuses `observe()`, `enqueue()`, `drain()`, `summary()` and normal owner `close()`, rather than sending any warning from mutated but uncommitted memory. When exclusive ownership was in effect, the lock deliberately remains in place to prevent a second process from automatically replaying an uncertain job. An operator must separately inspect the canonical record and private backups, confirm no process is still running, and explicitly approve recovery. No automatic lock stealing, replacement by a missing/corrupt file, or retry is performed.

These tests do not establish power-loss-safe directory sync, operating-system durability certification or human receipt of alerts. The outbox is still disconnected from live WhatsApp.

## Explicit limitations before live integration

1. **Not production-wired.** Real flood alerts continue through the existing path. An operator must separately approve any real integration after additional CI and staged acceptance.
2. **No exactly-once or guaranteed delivery.** A crash after remote acceptance but before local acknowledgement can cause a duplicate retry. Promise resolution is not evidence a human received the message.
3. **Opt-in exclusive single-owner fencing:** `createVirtualOutbox({dataDir, exclusive:true})` atomically creates a private `alert-outbox-v1.owner` lock file, verifies the owner token before each action and offers `close()` for orderly release. A second Node process is refused while the first owns the file. Even an already-opened legacy instance refuses operations if the exclusive lock appears. After a crash the lock is **not** stolen or removed automatically: the operator must verify no owner remains, inspect pending/in-flight records and only then explicitly release the stale lock. Nonexclusive mode remains for existing isolated tests and is **not cross-process safe**. Any future live integration must require exclusive mode and single-host ownership, with separate recovery/runbook acceptance.
4. **Synthetic remote-send timeout and quarantine:** Each fake send has a bounded wait (default 3 seconds; 1–5000 ms supported). Timed-out attempts are durably marked **ambiguous** and removed from automatic retry, even if the original Promise later resolves. The caller receives a best-effort `AbortSignal`, not a guarantee of network cancellation. An in-flight job found on restart is also quarantined. The core still does **not** authenticate the incoming field observation; upstream integrity is a separate requirement.
5. **No power-loss durability certification.** File sync and rename reduce partial-file risk but cannot prove behavior under all filesystem or sudden-power-off conditions.
6. **Private identifiers stored locally.** Pending jobs include recipient addresses and text as plaintext in a `0600` local file, not encrypted. Never commit, upload, or display outbox files; protect disk, backups and operator permissions.
7. **Capacity refusal is explicit, not a delivery success.** A full queue throws without discarding existing jobs, requiring operator observation and a separate failure policy.


**Known trade-off:** Quarantining uncertain sends reduces duplicate-message risk, but can also mean a warning was never delivered. It requires operator oversight and cannot establish reliable alert delivery. Definite synthetic callback rejections remain bounded retryable failures; a real adapter must separately classify ambiguous remote errors before approval. The module remains disconnected from live WhatsApp.

Next review: decide whether to add a source-verified, bounded orchestrator that integrates this core with alert transitions while preserving sender privacy, safe expiry, de-duplication and restart behavior. Add real-time stress simulations and negative-path logging/rollback tests before making any live change.

**Physical and real-account tests remain the operator's separate responsibility.**
