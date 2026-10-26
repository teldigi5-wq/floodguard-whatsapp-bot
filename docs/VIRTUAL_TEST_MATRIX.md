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

## Inactive historical test path — do not count as passing

The repository also contains `tests/format.test.ts` using Vitest and a historical TypeScript/serverless code path (`src/app.ts`, `src/handler.ts`, etc.). The active package manifest does **not** configure a Vitest test command or TypeScript compile/build step, and `npm test` does **not** execute `*.test.ts` files. Therefore:

- Do **not** count this test toward passing tests or coverage.
- Do **not** assume the old `deriveLevel` thresholds match the active CommonJS water calculations: these are different implementations.
- Do **not** claim the historical HTTP/webhook code is protected by the live service's administration tests.
- Reconcile, properly validate, or archive the legacy TypeScript subsystem only under a separately reviewed PR if it is genuinely required.

## Remaining virtual tests worth doing next

1. Test corrupted local subscriber/state storage and behavior under read-only/full-disk conditions, including log redaction and reliable recovery.
2. Fault-inject WhatsApp send failures and reconnection/queue backlogs. Current virtual tests **do not** prove at-least-once delivery or correct handling of partial subscriber failures.
3. Verify telemetry age and sequence ordering during slow, reconnecting Firebase streams; avoid claiming safe recovery when observations arrive out of order.
4. Add reproducible headless-browser interaction/accessibility E2E tests with pinned tooling, and distinguish those from real hardware tests.
5. Run independently approved Firebase Emulator rule checks against an owner-reviewed rules fixture, never by probing private production data.

Any resulting PR should preserve branch protections, avoid live accounts, and include before/after failure evidence.

## Later owner-controlled physical acceptance

Only with explicit approval, verify Arduino and HC-SR04 behavior, ESP8266 field connectivity, actual water thresholds, servo safety, real WhatsApp linked-device reliability, Windows installer/runtime behavior, and host deployment/rollback. Record device model, firmware, timing, conditions, expected/observed results, failure handling and evidence. None of these is verified by the synthetic CI suite.
