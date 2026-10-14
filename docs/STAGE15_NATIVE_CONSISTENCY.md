# Stage 15 — native Node characterization (review-only)

This draft PR adds `tests/stage15-native-consistency.test.js`, directly executing the **existing** `src/floodguard.js` exported classifiers and `commandReply` using the same synthetic input corpus recorded in website Stage 14. It never starts `bot.js`, imports a live WhatsApp session, sends a real message, opens a port, accesses Firebase or updates physical controllers. A temporary isolated DATA_PATH prevents contact with prior bot subscriber/session state.

The native bot observations confirm the source-review discrepancies: a 0 cm air gap with a separate 5 cm field returns **SAFE** under the existing bot parser; raw OPEN with angle 0 is presented **CLOSED**; with SAFE water and CRITICAL rain but reported LOW overallRisk, the risk command uses **LOW**. An unavailable sensor stays UNKNOWN, legacy rain status ONLINE is left unchanged, and old/future timestamps are labeled STALE.

These tests **lock in existing behavior for review**, not as approved safety behavior. They must not be treated as physical validation or an instruction to send flood warnings. Hardware was already flashed and is currently offline. The user has not approved WhatsApp pairing, live bot mode, host deployment or changes to Firebase production rules. The private Flutter app and website need separate native and UI acceptance before shared corrections.

Cross-repo fixture provenance: `teldigi5-wq/floodguard-website` draft PR #8, Stage 14 SHA `295d6f3d625a88675a923e865f78add7bc3bf2c2`. The local copy is synthetic data only; it does not refer to real device credentials, network identifiers or operational contacts.
