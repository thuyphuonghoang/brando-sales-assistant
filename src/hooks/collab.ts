"use client";
// Cộng tác thời gian thực: presence, khoá mềm theo field, lưu theo field + activity log.
import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { appConfig } from "@/lib/config";
import { firebase } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";

export interface PresenceEntry {
  uid: string;
  name: string;
  photoURL: string | null;
  lastSeen: number;
}

export function usePresence(clientId: string): PresenceEntry[] {
  const { user } = useAuth();
  const [all, setAll] = useState<PresenceEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;
    const { db } = firebase();
    const ref = doc(db, "clients", clientId, "presence", user.uid);
    const beat = () =>
      setDoc(ref, { uid: user.uid, name: user.displayName, photoURL: user.photoURL ?? null, lastSeen: Date.now() }).catch(() => {});
    beat();
    const t = setInterval(beat, appConfig.presenceHeartbeatMs);
    const onHide = () => deleteDoc(ref).catch(() => {});
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", onHide);
      deleteDoc(ref).catch(() => {});
    };
  }, [clientId, user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(firebase().db, "clients", clientId, "presence"), (s) =>
      setAll(s.docs.map((d) => d.data() as PresenceEntry)),
    );
  }, [clientId, user]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  return all.filter((p) => now - p.lastSeen < appConfig.presenceStaleMs);
}

export interface FieldLock {
  uid: string;
  name: string;
  expiresAt: number;
}

export const lockId = (path: string) => path.replace(/\./g, "__");

/** Tất cả khoá của một hồ sơ, theo lockId. */
export function useLocks(clientId: string): Record<string, FieldLock> {
  const { user } = useAuth();
  const [locks, setLocks] = useState<Record<string, FieldLock>>({});
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(firebase().db, "clients", clientId, "locks"), (s) =>
      setLocks(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as FieldLock]))),
    );
  }, [clientId, user]);
  return locks;
}

export function useFieldActions(clientId: string) {
  const { user } = useAuth();

  const acquire = useCallback(
    async (path: string) => {
      if (!user) return;
      await setDoc(doc(firebase().db, "clients", clientId, "locks", lockId(path)), {
        uid: user.uid,
        name: user.displayName,
        expiresAt: Date.now() + appConfig.fieldLockMs,
      });
    },
    [clientId, user],
  );

  const release = useCallback(
    async (path: string) => {
      await deleteDoc(doc(firebase().db, "clients", clientId, "locks", lockId(path))).catch(() => {});
    },
    [clientId],
  );

  /** Lưu MỘT field bằng dotted path — không ghi đè cả document. */
  const save = useCallback(
    async (path: string, value: unknown, label: string) => {
      if (!user) return;
      const { db } = firebase();
      await updateDoc(doc(db, "clients", clientId), {
        [path]: value,
        updatedAt: Date.now(),
        lastEditedBy: user.uid,
      });
      await addDoc(collection(db, "clients", clientId, "activity"), {
        uid: user.uid,
        name: user.displayName,
        action: "Sửa",
        field: label,
        at: Date.now(),
      });
    },
    [clientId, user],
  );

  return { acquire, release, save };
}
