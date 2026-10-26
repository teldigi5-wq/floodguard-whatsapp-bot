# Security release evidence and review gates

**Scope:** floodguard-whatsapp-bot merged security-remediation PR #17, assessed 26 October 2026. Security fixes are merged into main; this does not itself deploy the service or certify released binaries.

## Automated checks and defended boundaries

- Express transitive body-parser pinned at patched 1.20.9; Axios, Sharp, proxy-addr and qs updates are npm-audited.
- No registered Express JSON parser or body-handling POST path was identified; presence is not proof of exploitability.
- Existing tests cover admin guard failures, Firebase child-only public read scope, payload redaction, telemetry merging and error paths.
- Deployment is manual `workflow_dispatch`, with fail-closed admin token and patched Node LTS preflight.

**CI evidence:** https://github.com/teldigi5-wq/floodguard-whatsapp-bot/actions/runs/40265302978

To verify that the scan remains valid, use the latest PR-head workflow result; older CI links are historical evidence only. Zero findings from a dependency scan do **not** establish absence of application or infrastructure vulnerabilities.

## Mandatory manual and release checks

- [ ] In authorized staging, verify real WhatsApp messaging, Firebase RTDB read permissions, simulated level transitions, and alert delivery.
- [ ] Verify revoked or invalid admin token cannot modify configuration; check 401/503 behavior.
- [ ] Review production AWS/IAM/RTDB rules and least privilege without exposing secrets or user records.
- [ ] Review live telemetry reconnection, rate limits, logging redaction and rollback process.
- [ ] Inspect GitHub owner-only security alerts and obtain reviewer approval.

## Release decision standard

- For future security changes, require passing checks on the **exact PR head commit** before merging.
- Inspect future diffs and require human review; these merged PRs passed automated CI, but this report is not an independent security assessment.
- Never push API keys, account credentials, WhatsApp/Telegram session files or production customer data to a test log.
- Sign and publish only after owner approval, preserve reproducible artifacts and a rollback point.
- Label all claims precisely: **CI passed**, **packaged successfully**, **manual test performed**, or **not yet verified**. Never substitute one for another.
