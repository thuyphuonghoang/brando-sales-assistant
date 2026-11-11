"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { appConfig, isAllowedEmail } from "@/lib/config";
import { firebase, usingEmulators } from "@/lib/firebase/client";
import type { AppUser } from "@/lib/types";

interface AuthState {
  fbUser: User | null;
  user: AppUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Chỉ dùng với emulator: đăng nhập bằng email giả lập. */
  signInEmulator: (email: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export class DomainError extends Error {}

async function createSession(u: User) {
  // Kiểm tra tên miền phía client (lớp 1). Server và Security Rules kiểm tra lại.
  if (!isAllowedEmail(u.email) || !u.emailVerified) {
    await fbSignOut(firebase().auth);
    throw new DomainError(`Chỉ chấp nhận email @${appConfig.allowedDomain}`);
  }
  const idToken = await u.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    await fbSignOut(firebase().auth);
    const data = await res.json().catch(() => ({}));
    throw new DomainError(data.error || "Đăng nhập thất bại");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const { auth } = firebase();
    return onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      if (!u) {
        setUser(null);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    const { db } = firebase();
    return onSnapshot(
      doc(db, "users", fbUser.uid),
      (s) => {
        setUser(s.exists() ? (s.data() as AppUser) : null);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      },
    );
  }, [fbUser]);

  const value: AuthState = {
    fbUser,
    user,
    loading,
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: appConfig.allowedDomain, prompt: "select_account" });
      const cred = await signInWithPopup(firebase().auth, provider);
      await createSession(cred.user);
    },
    async signInEmulator(email, name) {
      if (!usingEmulators) throw new Error("Chỉ dùng được với emulator");
      const fake = JSON.stringify({ sub: email, email, email_verified: true, name });
      const cred = await signInWithCredential(firebase().auth, GoogleAuthProvider.credential(fake));
      await createSession(cred.user);
    },
    async signOut() {
      await fetch("/api/auth/session", { method: "DELETE" });
      await fbSignOut(firebase().auth);
      router.replace("/login");
      router.refresh();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth phải nằm trong AuthProvider");
  return v;
}
