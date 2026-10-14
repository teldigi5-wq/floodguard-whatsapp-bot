# FloodGuard Stage 3 — Windows offline operations readiness

**Status: review-only, draft PR #12. Nothing is deployed, paired, or connected to production.**

## Scope and truthfulness

Stage 3 rehearses only the **localhost Command Center** and a **temporary synthetic backup**. The already-flashed Arduino and ESP8266 are offline and must not be reflashed, reset or operated. The previous EC2 hosting account is inaccessible. The bot was previously operational, but there is no verified recovery of its prior WhatsApp session.

The rehearsal **does not** back up or restore `.env`, `DATA_PATH`, `auth/`, `subscribers.json`, `state.json`, Firebase data, phone identifiers or actual message history. It **does not** test encryption or recover real sessions. A SHA-256 checksum here catches accidental synthetic-file corruption but is **not** authentication against an adversary who can replace both file and checksum.

## Offline preparation

On an approved Windows development workstation (do **not** start the live bot):

1. Review and check out this PR's **tested commit**, then run `npm ci`, `npm run check` and `npm test`.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1` if no private `.env` exists; existing private settings are preserved. Keep the file out of Git and screenshots.
3. Run `npm run doctor` to check static configuration. Passing does **not** mean the WhatsApp/Firebase services or hardware are reachable.
4. Run `npm run drill:offline`. This creates a synthetic OFFLINE fixture backup in a uniquely named temporary directory, verifies its digest, rejects tampering, restores only that fixture, and erases that directory. It never uses actual session storage.
5. Run `npm run start:demo` and inspect `http://127.0.0.1:8085` locally. Choose each synthetic scenario; ensure OFFLINE and STALE never claim live water values. Stop with Ctrl+C.
6. On a disposable **CI/dev** Windows environment with no other demo process on the chosen port, optionally run `pwsh -NoProfile -File scripts/test-demo-recovery.ps1`. It starts and stops **only its own child** demo process twice to validate recovery. This is not a production restart manager.

Do not share the private token or expose the localhost-only demo through a tunnel or reverse proxy.

## Supervised acceptance evidence

| Gate | Evidence | Expected |
| --- | --- | --- |
| Offline code quality | Linux Node + Windows Node CI | All tests pass |
| Browser UX and accessibility | Chromium five viewport QA, axe | No test violations / overflow |
| Simulation boundary | synthetic API and browser request tests | No outbound WhatsApp, Firebase or device operations in demo |
| Windows recovery | `test-demo-recovery.ps1` CI step | Two cold-start demo cycles, QR remains 404, no real pairing |
| Synthetic backup integrity | `drill:offline` and its negative tests | Fixture verified, corrupted fixture rejected, temporary files cleaned |
| Realtime Database candidate rules | Firebase Emulator CI | Compatible candidate only, **not** production rules |
| Actual auth/session restoration | **Not attempted** | Requires explicit later approval and secure private backup |
| Live bot readiness and real sensor reliability | **Not tested** | Must not be described as certified or deployed |

## Incident response and rollback — offline demo only

If localhost demo fails, **stop only the foreground demo you started** with Ctrl+C. Verify that no live bot was inadvertently launched, run the read-only `npm run doctor`, review the failing local CI test without posting secrets, and roll back source to the last reviewed SHA if needed. Do not delete the `data/auth` folder, reset firmware or make a replacement QR. The CI recovery script kills only its own child PIDs; it never calls `pm2 restart`, restarts another Windows service, or touches live session files.

## Separate future approval gates

Before any actual Windows/EC2 bot activation or session backup: explicitly approve the hosting machine and listener/TLS design; review the Firebase production read/write policy and authenticated ESP uploads; inspect encrypted offline backups under least-privilege access without copying them to GitHub/CI; confirm authorized WhatsApp pairing and consent; enforce a single instance; prepare monitored rollback. Security review of the mobile repo's historical archive remains required before changing its private visibility. None of these future gates are authorized by completing Stage 3.
