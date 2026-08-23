"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.requireConfig = requireConfig;
exports.config = {
    port: Number(process.env.PORT || 3000),
    whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    metaAppSecret: process.env.META_APP_SECRET || "",
    firebaseUrl: process.env.FIREBASE_DATABASE_URL ||
        "https://floodguard-e3215-default-rtdb.asia-southeast1.firebasedatabase.app",
    schedulerRoleArn: process.env.SCHEDULER_ROLE_ARN || "",
    countdownFunctionArn: process.env.COUNTDOWN_FUNCTION_ARN || ""
};
function requireConfig() {
    const missing = [
        ["WHATSAPP_ACCESS_TOKEN", exports.config.whatsappToken],
        ["WHATSAPP_PHONE_NUMBER_ID", exports.config.phoneNumberId],
        ["WHATSAPP_VERIFY_TOKEN", exports.config.verifyToken]
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length)
        throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}
