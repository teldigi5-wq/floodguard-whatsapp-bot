# FloodGuard supervised release acceptance — 27 October 2026

**Decision: NO-GO for production.** This document is a reproducible handover checklist, not an instruction to merge, publish Firebase rules, start a hosted bot, link WhatsApp, or operate the dam gate.

## Branch and provenance
- Consolidated draft review branch: `integration/floodguard-alert-recovery-consolidated-20261027`; the earlier bot drafts #64, #65, #66 remain open for comparison.
- Protected `main` was `5f18eb956554b38a53624578984372843ed9b14f` at preparation.
- Test candidate must pass both Node.js 22.23.4 and 24.22.1 CI on the exact final commit, including active CommonJS tests, coverage reporting, syntax checks and configured production dependency audit.
- No original draft PR should be independently merged on top of the consolidated PR; resolve superseded review drafts only after explicit owner confirmation.
- Historic TypeScript/serverless test files are outside the active CommonJS test suite; they are **not** evidence of live bot correctness.

## Seven independent release gates

| Gate | Offline evidence | Required before real operation |
| --- | --- | --- |
| 1. Bot delivery and recipient state | Synthetic state-loss, subscriber-loss, replay/partial-batch and redacted operator-inspection tests | Owner review, signed-off backup + manual recovery procedure and approved deployment revision |
| 2. Firebase read/write authorization | Isolated Phase A and Phase B rules/emulator research in website drafts #8/#10 | Eliminate anonymous writes using a compatible authenticated writer with working device TLS, negative tests and separate Firebase cutover approval |
| 3. Mobile app | Private mobile draft #5 integrates read-only engineering reference and monitor-only UI | Restore GitHub Actions execution, pass Flutter analysis/tests/APK, install and verify on authorized Android device; keep mobile private until historic archive is reviewed |
| 4. Cross-client sensor/risk consistency | Synthetic shared fixtures and native models from earlier draft work | Resolve UNKNOWN-as-LOW, zero-distance, contradictory gate and freshness-window semantics with verified physical source evidence |
| 5. Hosting and recoverability | Local doctor, delivery/recipient inspectors, constrained setup routes and runbooks | Select and explicitly approve a replacement host; private auth/session backups, one-process lifecycle, TLS setup, tested rollback and an operator drill |
| 6. Physical + live end-to-end | Offline fake socket/telemetry tests only | Authorized read-only field observation first; verify Arduino/ESP8266 sensor calibration, upload contract, gate behavior only under safe physical test plan and real WhatsApp receipt |
| 7. Supervised production rollout | Source SHA, checks and release runbook | Named operator signs each gate, authorizes separate code/rules/firmware/host changes, rehearses independent warnings and rollback, and records acceptance |

## Safe local review commands

```sh
npm ci
npm run check
npm test
npm run test:coverage
npm audit --omit=dev --audit-level=high

# On the approved operator's EXISTING private DATA_PATH only:
npm run recovery:inspect
npm run subscribers:inspect
```

Inspectors output fixed redacted statuses, not private subscriber IDs or WhatsApp receipts. A clean diagnostic cannot prove real flood safety. Never run `state:bootstrap` to repair existing state: it is **only** an explicitly acknowledged first-install operation for a truly new empty directory.

**Stop conditions:** a previously recorded missing file, uncertain send, blocked inspector, corrupt storage, unknown/unverified field conditions, unintended parent Firebase read/write, failed Android CI, missing private backup, or unavailable manual-warning channel. During any suspected real hazard, follow the approved independent/manual warning process rather than trusting unverified automation.

**Zero mandatory paid services.** Do not re-enable inaccessible AWS infrastructure or procure a new paid host without the owner's approval.

## 2 November 2026 — draft integration of recovery and patched Node runtime

The new review branch is stacked on bot PR #67 exact head `24fe854522b7c9530f62fb57a5a29a3bef7dcaf5` and carries PR #68's Node runtime safety policy without dropping PR #67's state-bootstrap, subscriber inspection, alert recovery or extended syntax-check scripts. Node engine and package-lock root now match the reviewed patched 22.23.4 / 24.22.1 / 26.12.1 families. Existing CI is extended to the integration branch and PR #67 base for exact-head verification. Neither original PR is merged or changed.

**Not live acceptance:** engine constraints and CI do not upgrade a deployed Node binary. Host/runtime provenance, replacement hosting, live WhatsApp consent, private session backup, actual receipt/delivery and field Firebase/ESP/UNO states remain UNVERIFIED. Never pair a phone, start production sends, restore historical AWS, change Firebase Rules or operate the physical gate from this draft. Production **NO-GO**.
