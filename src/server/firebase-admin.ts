import "server-only";
// Firebase Admin SDK. Với emulator: đặt FIRESTORE_EMULATOR_HOST và FIREBASE_AUTH_EMULATOR_HOST,
// Admin SDK sẽ tự nối vào emulator (không cần credentials).
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function parseServiceAccount(raw: string | undefined) {
  if (!raw) return null;
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

let app: App | undefined;
let configured = false;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApp());
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-brando";
  const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  app = sa ? initializeApp({ credential: cert(sa), projectId }) : initializeApp({ projectId });
  return app;
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => {
  const db = getFirestore(adminApp());
  if (!configured) {
    configured = true;
    // Dữ liệu từ API Google có thể thiếu field (undefined) — bỏ qua thay vì lỗi.
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
};
