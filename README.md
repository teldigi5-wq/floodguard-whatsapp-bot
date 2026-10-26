<div align="center">

# FloodGuard · WhatsApp Alert Service

**IoT flood monitoring → Firebase RTDB → Node.js → WhatsApp messages**

[![FloodGuard CI](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/actions/workflows/ci.yml)
[Source](https://github.com/teldigi5-wq/floodguard-whatsapp-bot) · [Security](SECURITY.md) · [Release evidence](docs/SECURITY_RELEASE_EVIDENCE.md)

**A safety-conscious notification component in the FloodGuard student IoT project. Maintained by [Poojana Kaveesh Sellahewa](https://github.com/teldigi5-wq).**

</div>

## The problem this solves

Flood conditions can change before somebody is watching a dashboard. FloodGuard combines a prototype water-level sensor, microcontroller and network link with Firebase telemetry, then turns **verified changes** into understandable WhatsApp status and alert messages.

**This repository is the messaging and monitoring layer—not the Arduino firmware, physical floodgate controller, web dashboard or an officially certified flood-warning system.** It cannot itself move a gate.

| Layer | Technology and responsibility |
| --- | --- |
| Prototype sensing | HC-SR04 ultrasonic sensor + Arduino Uno |
| Network transport | ESP8266 → Firebase Realtime Database |
| Telemetry and logic | Node.js; child-only Firebase reads/SSE aggregation |
| User interface | WhatsApp bot commands and QR administration view |
| WhatsApp integration | Baileys linked-device session |
| Host target | Local machine or operator-managed Linux/EC2 with PM2 |
| Quality gate | Unit/virtual integration tests on Node.js 22 and 24 plus dependency audit |

### Architecture

~~~mermaid
flowchart LR
    H[HC-SR04 ultrasonic sensor] --> A[Arduino Uno]
    A --> E[ESP8266]
    E --> F[Firebase RTDB]
    F --> T[Child-only REST + SSE reader]
    T --> L[State evaluation / alert deduplication]
    L --> W[WhatsApp / Baileys]
    A --> G[Local servo / gate logic]
~~~

The bot **reads** telemetry; physical gate decisions stay within the embedded project. Firebase rules and working hardware are separate security/operational boundaries requiring their own validation.

## Implemented behavior

- User commands: **menu, stats, water, risk, gate, devices, rain, network, emergency, subscribe, unsubscribe**.
- Threshold-based water states, stale telemetry detection, gate/countdown reporting and sensor-error responses.
- Transition alerts for warning, danger, recovery and important gate changes; subscription state saved locally.
- Child-specific Firebase RTDB reads rather than accessing the whole private live subtree; SSE updates are combined into coherent snapshots.
- Protected QR/admin endpoints, bounded network payloads and reduced information leakage.
- Fail-closed handling when telemetry is missing or invalid, rather than inventing a water or rainfall reading.

**A WhatsApp command is not a safety-certified flood warning.** If Firebase, Wi-Fi, the host or WhatsApp fails, the service may be unavailable.

## Engineering decisions I can explain

| Design choice | Why | Evidence |
| --- | --- | --- |
| Validate ultrasonic distance before classifying risk | Absent, negative or out-of-range values must not be mistaken for SAFE | [src/floodguard.js](src/floodguard.js), [virtual scenarios](tests/virtual-flood-alerts.test.js) |
| Do not announce recovery from a bare backend SAFE label | Require meaningful sensor evidence before clearing confirmed danger | [Recovery regression PR #19](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/pull/19) |
| Reject far-future telemetry and duplicate transitions | Prevent invalid clock data or repeated snapshots from triggering misleading alerts | [Telemetry hardening PR #20](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/pull/20) |
| Limit Firebase data reads and error exposure | Avoid private fields, memory overuse and leaking internal URLs into chats | [src/firebase.js](src/firebase.js), [child-read tests](tests/firebase-public-children.test.js) |
| Separate CI and deployment | Tests must not automatically change a running EC2 bot | [CI](.github/workflows/ci.yml), [manual deploy workflow](.github/workflows/deploy.yml) |

**Ownership and evidence:** This repository records the maintained Node.js/WhatsApp service, technical decisions and security-focused PRs under [teldigi5-wq](https://github.com/teldigi5-wq). The broader FloodGuard hardware system is a student project; credit collaborators for their own contributions. The commit history does not establish that every line was independently authored without tools or assistance.

## Offline Command Center (synthetic demo only)

The isolated [Command Center](docs/OFFLINE_COMMAND_CENTER.md) shows five **fictional, deterministic** flood scenarios, local diagnostics and a non-delivering chat command preview. It runs as a separate localhost-only process; it **does not import the live bot**, open WhatsApp/Baileys sessions, call Firebase, or operate physical devices.

To try the interview demo without real accounts or hardware:

1. Run `npm ci`.
2. Copy `.env.example` to a private, untracked `.env` and set `FLOODGUARD_SETUP_TOKEN` to a locally generated, unique random token of at least 32 printable characters. Do **not** copy any real account/session credentials into this demo.
3. Run `npm run start:demo` and open `http://127.0.0.1:8085` on the **same computer**. Authenticate with username `admin` and the configured private token.
4. Switch between SAFE, WARNING, DANGER, STALE and OFFLINE scenarios, and use the simulated command/chat panel.
5. Stop with Ctrl+C. Nothing has been sent to WhatsApp or Firebase.

The demo protects its local endpoints with Basic authentication, strict Host/Origin checks, no-store headers and a restricted Content Security Policy. It is **not** a production administration interface or a substitute for hardware acceptance testing. Never publish the local listener to the Internet.

## Reproduce the automated checks

Prerequisites: a compatible **patched Node.js 22 or 24 runtime** (CI uses 22.23.4 and 24.22.1). The following does not require live Firebase, a WhatsApp account or Arduino hardware:

~~~bash
git clone https://github.com/teldigi5-wq/floodguard-whatsapp-bot.git
cd floodguard-whatsapp-bot
npm ci
npm run check
npm test
npm audit --omit=dev --audit-level=high
~~~

The configured CI includes synthetic tests on both Node.js versions, syntax/source checks and a production dependency audit; refer to the latest completed workflow for actual test counts. [View the workflow](https://github.com/teldigi5-wq/floodguard-whatsapp-bot/actions/workflows/ci.yml). Passing synthetic tests is not the same as real WhatsApp delivery or a tested physical flood event.

### Virtual test examples

- Null, malformed, negative or above-**400 cm** ultrasonic readings cannot fabricate SAFE water conditions.
- A SAFE string without a verified numeric measurement cannot generate a false recovery message.
- A simulated WhatsApp socket receives WARNING → DANGER → RECOVERY at state transitions, without duplicate alerts.
- Stale or far-future snapshots do not trigger new safety messages.
- Missing servo angle cannot silently override an explicitly reported OPEN state.
- Oversized Firebase streams fail before unbounded buffering; internal errors are not sent to WhatsApp users.

These are **synthetic test inputs**, not measured real-world sensor accuracy, latency or delivery statistics.

## Read-only deployment preflight

Before an explicitly approved **real** bot setup, run `npm run doctor`. This local check reads configuration and filesystem metadata without contacting Firebase, WhatsApp, EC2 or Arduino hardware, and without exposing token values or private paths. It verifies patched Node.js 22/24, local admin binding, the token's basic shape, Firebase URL syntax, data-directory accessibility and stale-data configuration.

- A `PASS` means **configuration syntax only** was accepted; it does **not** certify a connected account, a safe production deployment or durable EC2 storage.
- A `WARN` means manual follow-up may be required, for example a missing paired session.
- A `FAIL` blocks setup and must be resolved without weakening the checks.

The separate `npm run start:demo` path remains synthetic only; preflight does not grant approval to activate the real service.

## Configuration and operator setup

The application reads environment settings. Example placeholders (not working secrets):

~~~dotenv
PORT=8080
DATA_PATH=/data
FIREBASE_DATABASE_URL=https://YOUR_DATABASE.firebasedatabase.app
FLOODGUARD_STALE_MS=15000
FLOODGUARD_SETUP_TOKEN=REPLACE_WITH_LONG_PRIVATE_TOKEN
~~~

Never commit environment secrets, WhatsApp linked-device files, Firebase credentials or subscriber identifiers. Use a private writable data directory.

To start on a correctly configured local/host machine:

~~~bash
npm ci
npm run check
npm start
~~~

Production use requires private credentials, Firebase child-read rules that match the actual tree, network/firewall restrictions, session-storage permissions, operator sign-off and real WhatsApp device linking. The [deploy workflow](.github/workflows/deploy.yml) is **manual**; successful CI does not deploy to EC2. Current cloud hosting and end-to-end connectivity are **not asserted as online**.

### What is verified—and what isn't

| Repository evidence | Additional validation needed |
| --- | --- |
| Automated state-transition, Firebase, admin and parsing tests | Actual sensor calibration and environmental performance |
| CI across Node.js 22/24 | ESP8266 connectivity and hardware failure modes |
| Dependency and code checks | WhatsApp linking and alert delivery on an authorized test account |
| Synthetic gate-state assertions | Physical servo/gate response and electrical safety |
| Merged PR and commit history | EC2 readiness, production Firebase rules and rollback |

## Project map

| Path | Purpose |
| --- | --- |
| [src/floodguard.js](src/floodguard.js) | States, messages, alert transitions |
| [src/firebase.js](src/firebase.js) | Bounded Firebase reads and streams |
| [src/store.js](src/store.js) | Subscriber and state persistence |
| [src/adminAccess.js](src/adminAccess.js) | Protected setup access |
| [src/webUi.js](src/webUi.js) | Device-linking/admin UI |
| [tests/](tests/) | Synthetic Firebase, security and command tests |
| [docs/SECURITY_RELEASE_EVIDENCE.md](docs/SECURITY_RELEASE_EVIDENCE.md) | Security release evidence |

## Suggested interview demo

1. Draw the sensor → RTDB → bot path and explain which system owns the physical actuator.
2. Run **npm test** without real credentials; show a null-distance and transition-alert assertion.
3. Explain why failed or stale measurements must **not** be labelled SAFE.
4. Explain Firebase read scope, admin protections and secret handling.
5. State what is still unverified in real hardware/cloud conditions.

## Roadmap and responsible operation

- [ ] Record a real-device demonstration using safe, supervised conditions.
- [ ] Test authorized WhatsApp account pairing/reconnect and actual message delivery.
- [ ] Document recovery from Firebase outages and clock skew.
- [ ] Verify deployment, rollback and health checks on a configured host.
- [ ] Record team attributions, real screenshots and a hardware wiring diagram.

FloodGuard is a **prototype and engineering learning project**, not a replacement for official flood forecasts, warnings or life-safety equipment. For security issues, use [SECURITY.md](SECURITY.md).
