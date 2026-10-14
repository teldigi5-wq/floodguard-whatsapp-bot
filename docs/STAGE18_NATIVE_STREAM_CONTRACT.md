# Stage 18 — native offline SSE contract replay (bot)

The test-only `stage18-native-stream.test.js` replays the **identical**
synthetic `stage18-shared-child-stream.json` fixture held by the
FloodGuard website and PRIVATE mobile draft PRs.

It executes the real pure `src/firebase.js.applyEvent` function for
9 initial public child `put` events and 8 scenarios with `patch`,
null deletion, nested `put`, contradictory values, disconnected old
data, and invalid/missing source timestamp. The actual bot
`src/floodguard.js.fieldTimeMs` checks source-clock consistency.
It also checks that all private ESP8266 and parent branches fail closed.

No `streamLive`, `getLive`, `bot.js`, session pairing, WhatsApp sending,
hosting, hardware or production Firebase is used. These tests document
data transport behavior, not correct risk displays, field reliability,
device authentication or real notification delivery. The bot still runs
only in `npm run start:demo` when previewing it.

Source corpus: website draft PR #8 Stage 18. Compare the Git blob SHA
of the fixture between bot, website and PRIVATE Flutter branches before
claiming exact shared inputs. Keep all draft PRs unmerged. Production
Firebase anonymous writes remain a release-blocking vulnerability.
