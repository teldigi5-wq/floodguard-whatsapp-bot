'use strict';

// Pure, offline-only delivery recovery classification. Never mutates state.
// "No recorded failure" is NOT evidence of receipt or guaranteed operation.
function assessDeliveryState(state) {
  if (!state || Array.isArray(state) || typeof state !== 'object' ||
      typeof state.initialized !== 'boolean' ||
      typeof state.level !== 'string' ||
      typeof state.gateStatus !== 'string' ||
      !Array.isArray(state.sentCountdown) ||
      (state.deliveryUncertain !== undefined &&
       typeof state.deliveryUncertain !== 'boolean') ||
      (state.deliveryDegraded !== undefined &&
       typeof state.deliveryDegraded !== 'boolean')) {
    throw new Error('Invalid FloodGuard recovery state; operator review required');
  }
  if (state.deliveryUncertain === true) {
    return {
      status:'PAUSED_UNCERTAIN_DELIVERY',
      automaticAlertsPaused:true,
      operatorReviewRequired:true,
      manualFallbackRequired:true
    };
  }
  if (state.deliveryDegraded === true) {
    return {
      status:'DELIVERY_DEGRADED',
      automaticAlertsPaused:false,
      operatorReviewRequired:true,
      manualFallbackRequired:true
    };
  }
  // No completed baseline is not evidence of healthy alert delivery.
  // Keep explicit uncertainty and degraded flags above this check.
  if (state.initialized === false) {
    return {
      status:'NOT_INITIALIZED',automaticAlertsPaused:null,
      operatorReviewRequired:true,manualFallbackRequired:true
    };
  }
  return {
    status:'NO_RECORDED_FAILURE',
    automaticAlertsPaused:false,
    operatorReviewRequired:false,
    manualFallbackRequired:false
  };
}
module.exports={assessDeliveryState};
