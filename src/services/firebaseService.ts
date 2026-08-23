import admin from "firebase-admin";
import { config } from "../config";
import { LiveData } from "../types";

let initialized = false;
function init() {
  if (initialized) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw)),
      databaseURL: config.firebaseUrl
    });
  } else {
    // On AWS, prefer GOOGLE_APPLICATION_CREDENTIALS or workload credentials.
    admin.initializeApp({ databaseURL: config.firebaseUrl });
  }
  initialized = true;
}
function db() { init(); return admin.database(); }

export async function getLive(): Promise<LiveData | null> {
  const snap = await db().ref("/floodguard/live").get();
  return snap.exists() ? snap.val() as LiveData : null;
}
export async function addSubscriber(phone: string) {
  await db().ref(`/floodguard/bot/subscribers/${phone}`).set({ active: true, subscribedAt: Date.now() });
}
export async function removeSubscriber(phone: string) {
  await db().ref(`/floodguard/bot/subscribers/${phone}`).remove();
}
export async function getSubscribers(): Promise<string[]> {
  const snap = await db().ref("/floodguard/bot/subscribers").get();
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, any>)
    .filter(([,v]) => v?.active).map(([k]) => k);
}
export async function getBotState(): Promise<any> {
  const snap = await db().ref("/floodguard/bot/state").get();
  return snap.exists() ? snap.val() : {};
}
export async function setBotState(patch: Record<string, unknown>) {
  await db().ref("/floodguard/bot/state").update(patch);
}
export async function claimEvent(id: string): Promise<boolean> {
  const ref = db().ref(`/floodguard/bot/events/${id}`);
  const result = await ref.transaction(current => current ? undefined : { at: Date.now() });
  return result.committed;
}
