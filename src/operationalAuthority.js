'use strict';

// R3 H14: no deployed field source authentication, H11 witness,
// independent attestation, or operator-approved warning fallback exists.
// There is deliberately NO environment flag, caller-supplied public key,
// synthetic receipt, or admin mode that can authorize live operation here.
// Replacing this barrier requires a separate reviewed implementation and
// an independently witnessed real-world release decision.
const LIVE_DECISION = Object.freeze({
  releaseDecision: 'NO_GO',
  operationalStartupAllowed: false,
  automaticAlertsAllowed: false,
  sourceIdentityAuthenticated: false,
  independentWitnessVerified: false,
  approvedFallbackRecorded: false,
  reason: 'UNVERIFIED_SOURCE_AND_RELEASE_GATES',
});

function liveOperationDecision() {
  return LIVE_DECISION;
}

module.exports = { liveOperationDecision };
