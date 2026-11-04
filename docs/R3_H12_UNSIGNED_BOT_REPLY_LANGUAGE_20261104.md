# FloodGuard R3 H12 — unsigned WhatsApp read-side wording alignment

**4 November 2026 · review-only / DRAFT / PRODUCTION NO-GO.** Stacked on bot PR #69 at exact commit `c07db2be9901d97105dd091508a6e098cc2b44e3`. Do not merge, deploy, pair an account, or send real messages on the authority of this change.

## Why

The mobile H12 display correctly preserves `UNKNOWN` / `STALE` / `UNVERIFIED` for legacy unsigned Firebase RTDB. The bot's read-only commands previously called a *recent source timestamp* `Data: LIVE` and `FLOODGUARD LIVE STATS`, with a green icon. Timestamp freshness does **not** prove that the data was signed by the real sensor, witnessed, published by an authorized identity, physically measured, or that the gate is in a known position.

## Small change

- For all **read-only** sensor/status commands, the shared freshness line now says `⚠️ Data: RECENT REPORT · SOURCE UNVERIFIED` or `⚠️ Data: STALE · SOURCE UNVERIFIED`, while preserving the reported age.
- The stats heading is `FLOODGUARD REPORTED STATS` (stale remains `LAST RECORDED STATS`), and the menu describes a `reported sensor summary`.
- Keep numeric measurements and possible WARNING/DANGER reports visible as **unverified leads**; do not silently convert them into a certified all-clear or suppress a possible hazard. This change does not authenticate the device, prove that a risk report is correct, or add a signed evidence consumer.
- No alteration to automated WhatsApp delivery, subscribers, consent, Admin access, Firebase Rules, hardware, certificates, release signing, or the underlying `level`, `risk`, `isStale` or gate-safety classifier.
- Synthetic unit tests cover recent/stale read-only commands, lack of `LIVE` claims, preservation of potential CRITICAL reports, unavailable Firebase errors and redaction. Existing CI must pass on patched Node 22/24, with high-severity production dependency audit.

## Still unaccepted

The production alert dispatch path **does not** currently consume a deployed, independently witnessed and source-authenticated H11 certificate. It may process unsigned legacy telemetry. Manual or system-level operational restrictions must remain in force until the trusted ingestion, publisher/witness, authorization, and supervised phone/field warning-delivery gates are accepted. This change merely removes a demonstrably misleading message label, not the underlying operational trust deficit.

The separate mobile QA build is demo-only by default and its artifact is verified in PR #19, but real Android testing remains outstanding. The bot host, subscriber consent, actual WhatsApp delivery, authenticated field ingestion, real Firebase IAM, and UNO physical safety are not verified. **NO-GO.**
