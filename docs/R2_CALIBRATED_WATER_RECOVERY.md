# FloodGuard — calibrated water recovery boundary (R2)

**Draft PR #67, synthetic verification only. No real WhatsApp, Firebase writes, firmware, gate control, or deployment.**

## Defect identified

The bot formerly admitted any HC-SR04 air-gap value up to the sensor's
datasheet-scale 400 cm range, then **clamped** the calculated depth into
the 25 cm prototype sensor-to-bottom calibration. A 26 cm or 400 cm
distance could thus be interpreted as `SAFE`, and a newer false-SAFE
snapshot could generate an automatic recovery message even though the
distance is impossible for the configured installation.

A second mismatch allowed a numeric distance field left over from a
previous valid reading to override an explicit `SENSOR_ERROR` or
`OFFLINE` status. The bot also echoed a backend `LOW` overall-risk
label alongside locally validated WARNING/DANGER water conditions.

## Corrected scope

- `src/floodguard.js` requires a finite, positive, installation-specific
  sensor-to-bottom calibration (environment setting default: 25 cm;
  maximum transducer envelope: 400 cm). It admits physically plausible
  positive air gaps **only up to that installation calibration**.
  Distances beyond the installation are UNKNOWN; no clamping to zero
  depth/SAFE is allowed. If the distance key is present but invalid,
  a stale `levelCm` cannot be used as fallback.
- Explicit failed-sensor states (`SENSOR_ERROR`, `ERROR`, `INVALID`,
  `OFFLINE`, `UNAVAILABLE`, `DISCONNECTED`, `NOT_INSTALLED`,
  `REMOVED`) override otherwise plausible numeric placeholders.
- The separately tested `src/virtualAlertPlanner.js` calls the shared
  production water-level validator rather than independently accepting
  the transducer's 400 cm maximum. **It remains offline-only** and never
  dispatches real messages.
- The bot's risk summary now refuses to display backend `LOW` or
  `MODERATE` when water is unavailable/failed or the observation is
  stale. Measured WARNING displays at least HIGH; measured DANGER
  displays CRITICAL. Higher credible reported risk remains visible.

## Verification

`tests/calibrated-water-safety.test.js` adds five dependency-free,
offline Node tests for 25 cm vs 26/400 cm boundaries, sensor error
precedence, contradictory LOW backend risk, stale LOW, and fake
recovery proposals. Existing virtual alert tests now check the same
boundaries, including unsafe 400 cm recovery. All tests use synthetic
data with no delivery transport.

**Remaining cross-client difference:** This bot intentionally classifies
a literal **zero** air gap as unverified (sensor hardware minimum-range/
failure ambiguity), whereas the Flutter prototype reports 0 cm as
DANGER. The physical calibration/firmware must settle that conflict
before release; never assume both clients agree on zero-distance
semantics. Also verify any per-installation environment override rather
than presuming exactly 25 cm on real hardware.

**Release status: NO-GO.** Even passing offline CI cannot establish live
Firebase Rules, actual source authentication, real sensor reliability,
Arduino/ESP8266 TLS/key custody, gate state, durable alert receipts or
delivery guarantees. The private Flutter PR still lacks native CI
execution. Protected `main`, physical gate, live WhatsApp, and cloud
production remain unchanged.
