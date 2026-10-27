# FloodGuard: manual delivery-uncertainty recovery

**Scope:** Operator procedure for the CommonJS bot's recorded `deliveryUncertain` condition. This document does not authorize automatic recovery, replay, account pairing, server deployment, or a claim that any real alert was received.

## Why the bot stops

The active alert-send path has a bounded local wait. If a WhatsApp send does not settle, the message may have been delivered, may still arrive, or may never arrive. The alert processor records `deliveryUncertain: true`, stops further automatic sends, and continues recording observations without issuing another notification. The flag persists in private `state.json` across restarts.

**Do not assume the physical hazard is safe just because this software is paused.** Use an approved independent/manual warning channel for any actual flood hazard.

## Missing state and first-install bootstrap

`DATA_PATH/state.json` is safety-critical. Missing canonical state must never be treated as a safe alert-history reset. The service now refuses alert processing without a valid canonical file. An independent owner-only `state.ever-recorded` marker is created before the first state write under this version. If a previously recorded state disappears, that marker prevents silent recreation by normal state writes.

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
