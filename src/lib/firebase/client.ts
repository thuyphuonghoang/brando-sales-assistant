"use client";
// Firebase client SDK. Khi NEXT_PUBLIC_USE_EMULATORS=true sẽ nối vào Emulator Suite.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-brando.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-brando",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "demo-app",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

export function firebase() {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (useEmulators) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
  }
  return { app, auth, db };
}

export const usingEmulators = useEmulators;
