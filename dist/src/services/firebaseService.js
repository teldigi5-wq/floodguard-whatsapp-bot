"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLive = getLive;
exports.addSubscriber = addSubscriber;
exports.removeSubscriber = removeSubscriber;
exports.getSubscribers = getSubscribers;
exports.getBotState = getBotState;
exports.setBotState = setBotState;
exports.claimEvent = claimEvent;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const config_1 = require("../config");
let initialized = false;
function init() {
    if (initialized)
        return;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw) {
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert(JSON.parse(raw)),
            databaseURL: config_1.config.firebaseUrl
        });
    }
    else {
        // On AWS, prefer GOOGLE_APPLICATION_CREDENTIALS or workload credentials.
        firebase_admin_1.default.initializeApp({ databaseURL: config_1.config.firebaseUrl });
    }
    initialized = true;
}
function db() { init(); return firebase_admin_1.default.database(); }
async function getLive() {
    const snap = await db().ref("/floodguard/live").get();
    return snap.exists() ? snap.val() : null;
}
async function addSubscriber(phone) {
    await db().ref(`/floodguard/bot/subscribers/${phone}`).set({ active: true, subscribedAt: Date.now() });
}
async function removeSubscriber(phone) {
    await db().ref(`/floodguard/bot/subscribers/${phone}`).remove();
}
async function getSubscribers() {
    const snap = await db().ref("/floodguard/bot/subscribers").get();
    if (!snap.exists())
        return [];
    return Object.entries(snap.val())
        .filter(([, v]) => v?.active).map(([k]) => k);
}
async function getBotState() {
    const snap = await db().ref("/floodguard/bot/state").get();
    return snap.exists() ? snap.val() : {};
}
async function setBotState(patch) {
    await db().ref("/floodguard/bot/state").update(patch);
}
async function claimEvent(id) {
    const ref = db().ref(`/floodguard/bot/events/${id}`);
    const result = await ref.transaction(current => current ? undefined : { at: Date.now() });
    return result.committed;
}
