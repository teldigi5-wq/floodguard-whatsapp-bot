# Stage 17 — offline, read-only uncertainty notice candidate

This draft PR adds a **disabled-by-default, non-integrated** notice-copy
formatter `src/stage17ReviewNotice.js`. It returns bounded, plain text for
9 enumerated synthetic examples from the website Stage 14 corpus. It never
receives actual Firebase values, subscriber information, network metadata,
WhatsApp credentials or physical-device events.

The format deliberately says `REVIEW-ONLY · SYNTHETIC · NOT SENT · NOT LIVE`
and never promotes ambiguous telemetry to a confirmed SAFE/DANGER outcome,
physical gate position, authenticated sensor source or delivered warning.
The native Node tests execute the candidate formatter, check content,
reject unexpected scenario identifiers and ensure it is **not imported** by
`bot.js`, the live bot commands or the existing demo reply handler.
No bot behavior or demo UI has been changed.

Before any activation or merge, verify the actual firmware contract and
obtain a separate review of uncertainty wording and accessibility. Production
Firebase anonymous-write exposure, real host availability and all Stage 16
NO-GO controls remain unresolved. The only permitted executable user-facing
mode remains `npm run start:demo`. Do not pair WhatsApp or start live mode.
