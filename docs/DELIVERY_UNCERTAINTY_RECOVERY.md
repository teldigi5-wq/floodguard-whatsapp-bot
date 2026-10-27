# FloodGuard: manual delivery-uncertainty recovery

**Scope:** Operator procedure for the CommonJS bot's recorded `deliveryUncertain` condition. This document does not authorize automatic recovery, replay, account pairing, server deployment, or a claim that any real alert was received.

## Why the bot stops

The active alert-send path has a bounded local wait. If a WhatsApp send does not settle, the message may have been delivered, may still arrive, or may never arrive. The alert processor records `deliveryUncertain: true`, stops further automatic sends, and continues recording observations without issuing another notification. The flag persists in private `state.json` across restarts.

**Do not assume the physical hazard is safe just because this software is paused.** Use an approved independent/manual warning channel for any actual flood hazard.

## Missing state and first-install bootstrap

`DATA_PATH/state.json` is safety-critical. Missing canonical state must never be treated as a safe alert-history reset. The service now refuses alert processing without a valid canonical file. An independent owner-only `state.ever-recorded` marker is created before the first continued alert-state read/write under this version. If a previously recorded state disappears, that marker prevents silent recreation by normal state writes.

**Genuinely new installations only:** after an authorized operator selects a new, empty, absolute local `DATA_PATH`, and *before* starting live service, they may run:

```sh
export DATA_PATH=/absolute/private/floodguard-data
mkdir -p -m 700 "$DATA_PATH"
npm run state:bootstrap -- --acknowledge-new-installation
npm run recovery:inspect
```

The bootstrap command requires the exact acknowledgment flag and an empty, existing, nonsymlink directory. It writes only the private uninitialized alert state and its marker. It does not start WhatsApp, connect Firebase, establish user consent, replay messages, or certify safety. The inspector returns `NOT_INITIALIZED` with exit code 2, requiring review, until valid alert-state initialization.

**Never use this bootstrap command for recovery.** If `state.json` disappears, the marker remains, or old authentication/subscriber files exist, stop automatic alert operations, activate the approved manual warning channel, preserve confidential backups and logs, and investigate the preceding delivery uncertainty. Do not delete marker/state files, reset flags, restore unverified stale state, or replay automatic messages. Restoration requires a separately authorized and tested operator procedure.

These local checks are not tamper-proof against a host administrator or attacker able to replace all private files; `fsync` alone does not guarantee sudden-power-loss durability. They cannot prove actual WhatsApp receipt or a safe water level.

## Missing subscriber list — delivery failure boundary

The recipient enrollment list is also safety-relevant. On its first successful enrollment write, the bot records a separate, private `subscribers.ever-recorded` marker. Existing valid legacy `subscribers.json` files receive a marker before the next trusted read. An installation that has never enrolled anyone may have no subscribers file; **after enrollment has been recorded, a missing/symlinked file must not be treated as an empty list**.

Automatic alert dispatch revalidates the canonical subscriber file and the presence of each recipient before the next send. If an authorized person unsubscribes during a batch, later pending recipients are checked against the updated list; if the list disappears or becomes invalid, the batch fails closed without contacting the next recipient. A final check also detects loss on the last send. A request already started cannot be cancelled, and this mechanism cannot prove recipient receipt.

**Manual incident response:** preserve private backups, recipient consent evidence, source revision and operator notes without publishing identifiers. Use the independent warning process for suspected hazards; do not delete the marker, create an empty replacement list, re-enroll users from guesswork, or replay previous warnings automatically. Restoration and any safe re-enrollment require separate owner authorization and field acceptance.

The two markers protect against ordinary unexpected file loss on a trusted host, not malicious host administrators, all-files rollback, power-loss durability gaps or compromised disks. The synthetic tests have no live accounts, network services or physical hardware.

## Recipient registry preflight (read-only, no private identifiers)

A separate operator-only `npm run subscribers:inspect` command examines the existing local `DATA_PATH` without importing the live bot, initializing storage, accessing the network, opening WhatsApp, or modifying subscriber records. It reports only the fixed `status`, `operatorReviewRequired`, and `manualFallbackRequired` fields. It **never prints recipient identifiers, registry contents, counts, credentials, or filesystem paths**.

| Status | Exit | Meaning |
| --- | ---: | --- |
| `REGISTRY_PRESENT` | 0 | A nonempty, correctly shaped, marked local registry exists. **Not proof of active consent, WhatsApp receipt, identity validity, or operational readiness.** |
| `NO_RECORDED_ENROLLMENT` | 2 | Both registry and durable marker are absent; no recorded enrollment is demonstrated. Manual warning/channel review required. |
| `EMPTY_ENROLLMENT` | 2 | Marked registry exists but contains no recipients; do not assume automatic warnings can reach anyone. |
| `LEGACY_REGISTRY_UNSEALED` | 2 | Legacy registry exists without the independent marker. The inspector leaves it unchanged; operator must plan safe migration before operation. |
| `REGISTRY_UNAVAILABLE` | 3 | Missing after previous enrollment, symlinked, malformed, oversized, duplicate, unreadable, or otherwise unsafe registry/marker. Manual fallback and private incident review required. |

The inspector checks only a local trusted filesystem and uses fixed status codes to avoid disclosing private data. It **does not** attest current user consent, identity, recipients' ability to receive warnings, database integrity against a malicious host, or guaranteed delivery. Never treat exit code 0 as release approval. In incidents, preserve secure backups and activate independent warnings; never delete the marker or reconstruct enrollment from guesses.

## Offline inspection (read-only)

From the project checkout on the operator's authorized machine, with the **existing private** `DATA_PATH` configured:

```sh
npm run recovery:inspect
```

The command reads only `DATA_PATH/state.json`. It does not import or launch `bot.js`, access Firebase, open a WhatsApp socket, pair an account, send messages, or change the file. It prints only four fixed status fields: `status`, `automaticAlertsPaused`, `operatorReviewRequired`, and `manualFallbackRequired`. No state values, recipients, absolute paths, secret-bearing errors or message bodies are printed.

| Status | Exit | Meaning |
| --- | ---: | --- |
| `PAUSED_UNCERTAIN_DELIVERY` | 2 | Delivery outcome is ambiguous; automatic alerts are paused and operator review/manual warning are necessary |
| `DELIVERY_DEGRADED` | 2 | A past send failure was recorded; automatic sends are not necessarily paused, but receipt needs review |
| `NOT_INITIALIZED` | 2 | Uninitialized prior state; operator review/manual warning required |
| `NO_RECORDED_FAILURE` | 0 | No explicit delivery-failure flag recorded. **Not proof of delivery or health** |
| `INSPECTION_FAILED` | 3 | Missing, malformed, oversized, symlinked or unreadable canonical state. Treat automatic alert health as unknown, never reset state from this check |

The inspector accepts only an owner-controlled local state file, refuses a symbolic-link canonical file, and limits reads to 128 KiB. Read-only here describes state-file behavior; it does not certify host permissions or hardware safety.

## Operator actions after a paused/unknown result

1. **Use the site's approved independent warning process immediately** whenever there is a suspected flood or gate hazard. Do not rely on WhatsApp automation during uncertainty.
2. Preserve the existing private state, transport/host health evidence and a secure owner-only backup. Never publish subscriber IDs, WhatsApp credentials, raw errors or chat contents in an issue or log.
3. Determine with the account owner whether the timed-out send was actually attempted, accepted, delivered or still pending, and which intended recipients may have missed the warning. A successful send API response is not proof of human receipt.
4. Check sensor-source authorization, timestamp freshness, current physical hazard and consent/allowlist. Assess whether replay would create a dangerous duplicate or stale flood warning.
5. **Do not erase `deliveryUncertain`, remove locks, replay the queue, or resume live delivery via this inspector.** Those are deliberately unsupported; a separately authorized, implemented and tested recovery process with manual sign-off is still required.
6. Verify the independent warning channel remains usable during any bot outage. Only test live delivery with account-owner authorization and a controlled physical acceptance plan.

## Verification boundaries

`tests/delivery-recovery-visibility.test.js` uses temporary synthetic state, fake subscriber identifiers and subprocess execution to exercise read-only behavior, redacted reports, missing/corrupt state, symlink and oversized-file rejection, and honest `stats`/`risk`/`emergency`/`subscribe` wording.

This is **not** an operationally completed recovery mechanism. It does not settle ambiguous WhatsApp delivery, provide acknowledgements, change live credentials, certify Firebase RTDB rules, or substitute for real flood-safety procedures. Do not claim exactly-once notifications or human receipt.
