# floodguard-whatsapp-bot — recovery roadmap / plans (9 November 2026)

> Review-only draft PR [#73](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/pull/73); not merged, audited across every branch, deployed or owner-accepted. This complements, not replaces, product roadmaps.

## Last recorded context
Status observed from the current `main` README on 2026-11-09: FloodGuard RTDB-to-WhatsApp notification component, not physical gate control or an accredited public warning system. No new code build, physical-device QA, merge, deployment, security certification or owner acceptance was performed by writing this file. 

## Recover before developing
1. Read README, this repo's existing architecture, issue tracker, product roadmap and [original handoff](AI_CONTINUATION_2026-11-09.md).
2. Paginate **all** branches and PRs, check protected main vs feature branches, chained bases, open security findings and recent CI. Record SHA/ref and source-test identity; don't reproduce prior completed stages.
3. Distinguish *planned, coded, locally tested, independent exact-source CI, merged, deployed, owner verified*. Only current independently verified evidence advances status.

## Next non-repeating milestones
1. **M1:** Inspect actual Firebase child read scopes and freshness/unknown handling
   - Acceptance: exact current commit/PR, repeatable result incl. negative/security cases, reviewer or operator signoff if applicable, documented remaining blocker.
2. **M2:** test signed provenance/alert dedupe and opt-in messaging with synthetic data
   - Acceptance: exact current commit/PR, repeatable result incl. negative/security cases, reviewer or operator signoff if applicable, documented remaining blocker.
3. **M3:** verify operator-owned device acceptance
   - Acceptance: exact current commit/PR, repeatable result incl. negative/security cases, reviewer or operator signoff if applicable, documented remaining blocker.
4. **M4:** align evidence with FloodGuard web/mobile branches.
   - Acceptance: exact current commit/PR, repeatable result incl. negative/security cases, reviewer or operator signoff if applicable, documented remaining blocker.

## Continuation order
- **Phase 0:** read-only inventory and evidence reconciliation; do not re-open closed stages without regression evidence.
- **Phase 1:** deliver only the next missing feature/fix on an isolated review branch; prefer $0 local tools.
- **Phase 2:** verify unit/integration/E2E, security, dependency/secret scanning, accessibility/performance as relevant. CI availability or budget failure is BLOCKED, not PASS.
- **Phase 3:** exact-SHA integration and rollback review; do not blindly merge stacked PRs or force push.
- **Phase 4:** independently verify real operator/device/provider/deployment controls, keep all NO_GO gates until evidence and permission exist.

## How to inspect safely
```bash
gh repo view teldigi5-wq/floodguard-whatsapp-bot
gh pr list -R teldigi5-wq/floodguard-whatsapp-bot --state open --limit 100
gh issue list -R teldigi5-wq/floodguard-whatsapp-bot --state open --limit 100
gh run list -R teldigi5-wq/floodguard-whatsapp-bot --limit 20
git fetch --all --prune
git log --graph --decorate --all -30
```
For >100 branch/PR records, use a **paginated read-only** inventory (offline handoff archive script); do not assume these commands alone cover history.

## Documentation and branch policy
Carry this document via approved PR to `main`; do NOT bulk-copy it into hundreds of active or historical branches. Leave branch code unchanged; record per-branch unique gates in [milestone tracker](AI_MILESTONES_2026-11-09.md). No credentials, paid subscriptions, live deployment, real-user data or publishing without authorization.
