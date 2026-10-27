# FloodGuard virtual test inventory and evidence boundaries

Last reviewed: 2026-10-26.

## Authoritative automated runtime

The current active service entrypoint is `bot.js` (CommonJS), with runtime modules under `src/*.js`. The supported automated suite runs through `npm test` (`node --test tests/*.test.js`) and the Node.js 22.23.4 / 24.22.1 GitHub CI matrix. The `npm run test:coverage` command prints a separate built-in Node coverage summary. Coverage is **informational**, not a security certification or proof of absence of defects.

| Domain | Active synthetic verification | Important limitation |
|---|---|---|
| Flood statuses and water measurements | Null/empty/invalid readings, threshold transitions, stale timestamps, recovery safeguards | Real ultrasonic calibration and physical environment not measured |
| WhatsApp alert state changes | Simulated WARNING/DANGER/RECOVERY, duplicate suppression, concurrent event ordering, malformed event recovery | Fake socket; not live delivery, acknowledgements, retry or rate-limit validation |
| Firebase transport | Exact allowlisted child REST/SSE URLs, denial behavior, bounded buffers, fragmented CRLF frames, prototype path rejection | Mocked HTTP and streams; production RTDB rules and network latency not verified |
| Admin QR/setup | Loopback binding, authentication failures, no-store security headers, Express 5 HTTP behavior | Tests do not verify real WhatsApp pairing or reverse-proxy TLS |
| Offline Command Center | Synthetic deterministic cards and chat preview, localhost authority checks, CSP and response regressions | No browser automation on actual mobile hardware |
| Configuration preflight | Patched Node version gate, private token format, HTTPS URL and data-dir checks, secret redaction | No live credentials, durability or remote-host validation |
| Dependencies | `npm ci` lockfile checks, production `npm audit --omit=dev --audit-level=high`, Pino/dotenv contract tests | A successful audit is not a supply-chain security guarantee |

## Measured coverage snapshot (GitHub PR #33)

Source: [Node.js 24.22.1 CI job](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/actions/runs/40316677742/job/121550906381), 2026-10-26. The job passed **51 tests**, then reran the 51 active JavaScript tests with Node's built-in coverage reporting:

- Instrumented `src/` modules: **94.04% lines**, **73.80% branches**, **88.24% functions** in that Node 24 run.
- Specifically: `src/firebase.js` **92.86% lines / 71.60% branches**; `src/floodguard.js` **86.49% lines / 68.57% branches**.
- This is coverage of **loaded source modules only**. The live `bot.js` startup path and historical TypeScript files were **not imported** by these tests and are not included in those numbers. Browser and hardware functionality are also not covered.
- The Node.js 22 report includes test files and therefore produces a different `all files` denominator; **do not compare its overall percentage directly** with Node 24's `src/`-only report.

Branch coverage, untested startup behavior, delivery failure paths and hardware dependencies remain meaningful gaps. These figures are observations from a named CI run, not a claim of comprehensive security assurance.

## Inactive historical test path — do not count as passing

The repository also contains `tests/format.test.ts` using Vitest and a historical TypeScript/serverless code path (`src/app.ts`, `src/handler.ts`, etc.). The active package manifest does **not** configure a Vitest test command or TypeScript compile/build step, and `npm test` does **not** execute `*.test.ts` files. Therefore:

- Do **not** count this test toward passing tests or coverage.
- Do **not** assume the old `deriveLevel` thresholds match the active CommonJS water calculations: these are different implementations.
- Do **not** claim the historical HTTP/webhook code is protected by the live service's administration tests.
- Reconcile, properly validate, or archive the legacy TypeScript subsystem only under a separately reviewed PR if it is genuinely required.

## Delivery-failure behavior (not a retry guarantee)

Synthetic partial-send tests exercise one accepted fake WhatsApp send and one rejected fake send. The alert processor stores aggregate `alertSendFailureCount`, `lastDeliveryFailureAt` and a sticky `deliveryDegraded` indicator in the protected local `state.json`, without recording recipient identifiers or transport exceptions. Logs emit a redacted failure notice.

**Important limitations:** A successful `sock.sendMessage` call is not proof that the recipient actually received or read the message. A failed call is **not currently retried** by a durable outbox; the current implementation may advance the alert transition even when some sends fail. The counters record attempted failures, not missed real-world messages. Correct bounded retry, deduplication after process restarts, expiry of obsolete hazard warnings, and delivery acknowledgement policies remain issue #35 work. Operators must not claim reliable notification delivery based on these tests.

## Firebase SSE connection-lifecycle regression

An offline-only synthetic test opens the exact allowlisted child streams and simulates an unexpected **clean EOF** after the first complete snapshot. A clean remote EOF is now classified as a stream outage and surfaced through the existing redacted error event, allowing the bot's current Firebase health listener to switch to `RECONNECTING`. A deliberate `stream.stop()` is not an outage. The checks do **not** connect to Firebase production, prove Firebase Emulator permissions, or establish an actual network reconnect success rate.

## Reconnected SSE baseline integrity

Offline red/green tests now simulate a complete first water snapshot, remote child EOF, automatic reconnect and a premature partial `/status` PATCH. A new child stream does **not** rejoin the composite LIVE snapshot until it receives a fresh root `put` event; the old child values are cleared when its former stream ends. This prevents old SAFE air-gap measurements from being combined with a new stream's partial status to imply a misleading fresh reading. A fully reinitialized DANGER water snapshot is accepted. Tests use fake `ReadableStream` responses only; they do not prove production Firebase delivery, source authenticity, or real network recovery.

## Firebase shutdown and retry-timer cleanup

An isolated child-process test stubs all Firebase child HTTP requests to return 503, allowing the nine SSE watchers to enter their reconnect backoff. `stream.stop()` now cancels and releases pending retry waits immediately rather than retaining 1–30-second Node.js timers after intentional shutdown. The child exits normally, without force-killing the process. This test uses only stubbed `fetch` responses; it does not access production Firebase or prove deployment/network behavior.

## Firebase initial-snapshot liveness watchdog (2026-10-27)

The active `streamLive()` now sets a **10-second** initial-snapshot watchdog for **each** of the nine allowlisted child SSE streams. The deadline starts before the HTTP handshake and ends only after that child supplies its own complete root `put` event. A stalled handshake or stream that never sends the first root snapshot is aborted and emits the fixed `Firebase telemetry initial snapshot timed out` diagnostic through the existing reconnect handler. The timeout is configurable between 25 and 60,000 milliseconds solely for controlled virtual tests; invalid settings are rejected before any stream watcher starts.

Offline Node tests simulate an AbortSignal-aware stalled HTTP handshake, premature PATCHes with no initial root PUT, and a healthy indefinitely open SSE after a valid baseline. Normal `stop()` clears outstanding snapshot timers in addition to reconnect timers. These tests are **not** proof of production Firebase reliability or rule authorization. A transport that ignores cancellation entirely is outside this mocked liveness contract.

## Local admin failed-authentication throttle (2026-10-27)

The shared loopback-only Basic-auth guard now limits failed credentials across its protected routes: **32 failed attempts in a 60-second window**, followed by a **60-second temporary lockout**, returning HTTP `429` and `Retry-After` rather than repeatedly challenging credentials. Correct authentication resets the failed-attempt budget outside a lockout; even correct credentials cannot bypass an active lockout. The limiter uses **one bounded in-memory counter per guard instance**, never the untrusted `X-Forwarded-For` header, and does not store passwords or tokens.

Deterministic offline tests inject a private synthetic token, short test limits, and a fake clock to exercise lockout, expiry, authorized recovery and forwarded-header spoofing. Node CI and the offline Chromium workflow verify that existing routes remain functional. This is **not** a distributed, persistent or internet-facing rate limiter; process restart clears counters, and excessive bad requests can temporarily deny access to the legitimate operator. The administrative service must remain on loopback behind an operator-approved tunnel/TLS boundary. No live host or account was tested.

## Local private-storage failure injection (2026-10-27)

The active CommonJS `src/store.js` now stages changes to subscriber and alert-state JSON through an **exclusive, unpredictable per-write temporary file**, with owner-only `0600` mode, `fsync` of the staged file and an atomic same-directory rename. Failures before replacement attempt to close and remove the staged temporary record, preserve the last canonical file and return a **fixed, non-sensitive diagnostic** rather than raw OS path/secret-bearing errors. Newly created private directories request owner-only `0700` permissions.

Offline fault-injection tests simulate an attacker-planted legacy `state.json.tmp` symlink, partial ENOSPC writes, EROFS-style rename failures, file-sync errors, abandoned crash temp files and owner-only file permissions. They also simulate an explicit operator-owned backup, deliberate canonical corruption and **manual** backup restoration. The application intentionally does not scan or silently promote abandoned temp files or backups. These are **synthetic tests on GitHub Actions filesystems**, not certified sudden-power-loss durability, automatic crash recovery, Windows filesystem semantics or verified operator backups. Actual disk/host permissions, secure backup storage and rollback still need owner acceptance.

## Firebase SSE post-baseline inactivity watchdog (2026-10-27)

The active `streamLive()` now distinguishes receiving the first complete child snapshot from the **ongoing liveness** of each of the nine Firebase RTDB SSE channels. After a valid root `put`, a per-child **120-second default inactivity deadline** is reset only by a valid `put`/`patch` data event or Firebase `keep-alive` event. Unrecognized comment-only chatter and arbitrary partial bytes do not reset the deadline. A silent stream triggers a fixed, redacted `Firebase telemetry stream idle timed out` error and a new connection must obtain a **fresh root snapshot** before becoming connected again. The idle deadline is injected at 25–300,000 ms only for deterministic virtual testing; deliberate `stop()` cancels all associated timers.

Synthetic tests exercise one silent water channel while other streams keep sending heartbeats, subsequent reconnect to a changed DANGER root, a healthy unchanged reading kept alive by recognized heartbeat events, comment-only traffic failing closed, invalid options and a separate Node subprocess exiting after intentional stop. These verify the mock transport behavior, **not** actual Firebase permissions, source authentication, sensor freshness, mobile connectivity or real alert receipt. A valid heartbeat only indicates SSE connection liveness; it does not prove the physical sensor produced a recent measurement.

## Local subscriber identity and capacity boundaries (2026-10-27)

The active `src/store.js` now restricts persisted WhatsApp subscribers to supported, well-formed Baileys chat identifiers for individual (`@s.whatsapp.net`), linked-device (`@lid`) and group (`@g.us`) destinations. It refuses embedded whitespace, control characters, arbitrary external domains and status-broadcast recipients before writing the canonical private file. A repeated valid subscription is idempotent, and unsubscribe retains its existing semantics.

The private subscriber list is limited to **512 entries**, and a JSON subscriber file larger than **128 KiB** is rejected before parsing. Oversized, invalid or tampered lists are **not** silently truncated or overwritten. New enrollment when full produces a fixed capacity failure. The policy protects against unbounded local send loops; it does **not** authenticate a user as the rightful owner of a WhatsApp JID or certify message delivery.

`tests/subscriber-store-validation.test.js` exercises fake individual/LID/group JIDs, malicious malformed destinations, persisted corrupt entries, full and oversized subscriber lists, failure privacy, existing state preservation and idempotent enrollment. Only synthetic test recipients are used. **Operational caveat:** existing legacy subscriber records using unusual identifiers may need operator-controlled review and migration; they are deliberately not accepted automatically. Full installation/real-account tests remain separate.

## Private Firebase transport-error redaction (2026-10-27)

The active REST/SSE client no longer exports **raw rejected fetch errors**, **failed body-reader exceptions**, or **untrusted JSON syntax messages** to calling code. Those error sources can contain entire Firebase query URLs, including a configured `auth` credential, or excerpts of otherwise private telemetry. They are replaced by fixed non-sensitive diagnostics (`Firebase telemetry request failed`, `Firebase telemetry transport failed`, `Firebase telemetry response stream failed`, `Firebase telemetry response invalid JSON` and `Malformed Firebase telemetry event`). Deliberately constructed, bounded HTTP status diagnostics, source authorization-revoked status and existing explicit liveness errors retain their distinct categories.

Offline tests inject fictional credential-bearing URLs into both REST `fetch` and stream failures and into SSE `fetch` and reader failures after a root snapshot. Tests verify no private URL/token reaches callers or emitted `error` events. These are **synthetic transport checks**, not proof that all production SDKs, upstream proxies, log aggregators or WhatsApp dependencies are free of secret leakage. Real credentials and production Firebase were not accessed.

## Same-source-clock flood recovery safeguards (2026-10-27)

The active CommonJS `src/floodguard.js` now refuses a **water-hazard de-escalation** when an apparently safer observation has exactly the same normalized `system.lastUpdate` timestamp as the last confirmed WARNING/DANGER. A contradictory SAFE or WARNING patch at the same field clock is not independently newer physical evidence of recovery. It cannot clear the stored DANGER state or emit a recovery message. A newer, measured SAFE observation can still recover normally, and same-timestamp **hazard escalation** and independent dam-gate changes are preserved.

The red-first isolated `tests/field-clock-deescalation.test.js` suite reproduced false SAFE recovery and DANGER→WARNING downgrade with fake readings and a fake WhatsApp sender; two control tests confirmed allowed escalation and gate updates. This is a small state-transition validation improvement and does **not** authenticate sensor hardware, establish Firebase RTDB authorization, remove the active serialized send-loop limitations, or prove delivery to a person.

## Active alert-send deadline and uncertain-delivery quarantine (2026-10-27)

The active CommonJS `src/floodguard.js` previously awaited each `sock.sendMessage()` indefinitely, blocking all subsequent serialized telemetry processing. It now bounds **each local alert send wait** to **5 seconds by default** (test-injectable via `FLOODGUARD_SEND_TIMEOUT_MS`, validated integer 25–30,000 milliseconds before sending). An explicit Promise rejection is counted as a failure and processing can continue to the next recipient, but a **timeout has an ambiguous remote outcome**. The processor stops attempting further recipients, persists `deliveryUncertain: true`, `deliveryDegraded: true`, aggregate failure count, time and latest observed level, and throws only a redacted operator-review error. Future sensor updates may record their latest observed level but **do not trigger additional WhatsApp alerts** while the persisted uncertainty latch remains set. A late Promise resolution cannot clear this latch. Restoring delivery requires **manual operator review** of the actual transport, recipient impact and state file; clearing the latch is deliberately not automated.

Isolated `tests/alert-send-timeout.test.js` uses only fictional WhatsApp JIDs, a fake socket, and temporary state files to verify stalled sends, no subsequent sends or false recovery after ambiguous DANGER, late success, ordinary rejection accounting, normal DANGER/recovery transitions and invalid policies. The timeout bounds the application wait but **cannot cancel remote delivery**, certify that someone received an alert, or guarantee exactly-once operation. This fail-closed policy may suppress later notifications until reviewed, so an explicit manual flood warning / alternate escalation procedure is required before considering any production rollout. No real accounts, Firebase, devices or deployment were accessed.

## Read-only uncertain-delivery inspector and user-visible alert status (2026-10-27)

After a bounded WhatsApp send timeout, the active bot persists `deliveryUncertain: true` and suppresses further outgoing automatic alerts until reviewed. The user-facing `stats`/`status`, `risk`/`flood`, `emergency`/`alarm` and new `subscribe` responses now explicitly report `ALERT DELIVERY PAUSED`, advise manual warning and avoid falsely promising messages. Ordinary partial delivery failures remain separately described as `DELIVERY DEGRADED`. If private state cannot be read, they report that alert-delivery status is unknown.

A deliberately **read-only** command, `npm run recovery:inspect`, inspects only the operator-configured canonical local `DATA_PATH/state.json` and prints fixed, non-sensitive status flags with exit codes 0 (no recorded failure), 2 (operator review) or 3 (invalid/missing state). It refuses symlinked, oversized, invalid and corrupt state rather than creating or rewriting anything, clearing the latch, replaying alerts or importing the live bot. Synthetic tests exercise paused/degraded/normal states, honest command responses, redaction, file immutability, malformed or missing records, symlink refusal and size bounds.

**Manual recovery is not implemented:** see `docs/DELIVERY_UNCERTAINTY_RECOVERY.md` for the operator-only warning fallback and required separate authorization. This check cannot verify actual WhatsApp receipt, physical water conditions, RTDB access rules, or host security.

## Missing alert-state fail-closed tests (2026-10-27)

The active CommonJS store refuses missing/symlinked canonical alert state instead of fabricating a fresh initialized baseline. A separate private `state.ever-recorded` marker blocks silent recreation after deletion, including an in-flight fake send. An explicit offline bootstrap is limited to operator-acknowledged empty directories; it is not a recovery path. An old canonical state without a marker can be migrated on a subsequent authorized write.

The synthetic tests cover process restart, deletion during send, missing and corrupt state, marker preservation, legacy migration and bootstrap refusal on reused paths. Existing synthetic first-snapshot tests explicitly initialize fixtures. Nothing here verifies filesystem power-loss guarantees, delivery receipts, Firebase authorization, production host integrity or physical safety.

## Remaining virtual tests worth doing next

1. Test corrupted local subscriber/state storage and behavior under read-only/full-disk conditions, including log redaction and reliable recovery.
2. Fault-inject WhatsApp send failures and reconnection/queue backlogs. Current virtual tests **do not** prove at-least-once delivery or correct handling of partial subscriber failures.
3. Verify telemetry age and sequence ordering during slow, reconnecting Firebase streams; avoid claiming safe recovery when observations arrive out of order.
4. Add reproducible headless-browser interaction/accessibility E2E tests with pinned tooling, and distinguish those from real hardware tests.
5. Run independently approved Firebase Emulator rule checks against an owner-reviewed rules fixture, never by probing private production data.

Any resulting PR should preserve branch protections, avoid live accounts, and include before/after failure evidence.

## Later owner-controlled physical acceptance

Only with explicit approval, verify Arduino and HC-SR04 behavior, ESP8266 field connectivity, actual water thresholds, servo safety, real WhatsApp linked-device reliability, Windows installer/runtime behavior, and host deployment/rollback. Record device model, firmware, timing, conditions, expected/observed results, failure handling and evidence. None of these is verified by the synthetic CI suite.
