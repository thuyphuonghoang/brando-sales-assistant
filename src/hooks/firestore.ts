"use client";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import type { AppUser, CaseDef, Criterion, Industry, PriceItem, RuleRow, StandardPackage, StatItem } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";

/** Lắng nghe realtime một document. `path` null → không lắng nghe. */
export function useDoc<T>(path: string | null): { data: T | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: !!path,
    error: null,
  });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(firebase().db, path),
      (s) => setState({ data: s.exists() ? ({ ...(s.data() as T), id: s.id } as T) : null, loading: false, error: null }),
      (e) => setState({ data: null, loading: false, error: e.message }),
    );
  }, [path]);
  return state;
}

/** Lắng nghe realtime một query. `key` dùng để tạo lại listener khi query thay đổi. */
export function useQuery<T>(make: (() => Query<DocumentData>) | null, key: string): { data: T[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: T[]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!make) return;
    return onSnapshot(
      make(),
      (s) => setState({ data: s.docs.map((d) => ({ ...(d.data() as T), id: d.id })), loading: false, error: null }),
      (e) => setState({ data: [], loading: false, error: e.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useCatalog() {
  const prices = useDoc<{ items: PriceItem[] }>("catalog/prices");
  const rules = useDoc<{ items: RuleRow[] }>("catalog/rules");
  const industries = useDoc<{ items: Industry[] }>("catalog/industries");
  const stats = useDoc<{ items: StatItem[] }>("catalog/stats");
  const packages = useDoc<{ items: StandardPackage[]; cases: CaseDef[]; criteria: Criterion[] }>("catalog/packages");
  const meta = useDoc<{ syncedAt: number; errors: string[] }>("catalog/meta");
  return {
    prices: prices.data?.items ?? [],
    rules: rules.data?.items ?? [],
    industries: industries.data?.items ?? [],
    stats: stats.data?.items ?? [],
    packages: packages.data?.items ?? [],
    cases: packages.data?.cases ?? [],
    criteria: packages.data?.criteria ?? [],
    syncedAt: meta.data?.syncedAt ?? null,
    loading: prices.loading || industries.loading,
  };
}

export function useUsers() {
  const { user } = useAuth();
  return useQuery<AppUser>(user ? () => collection(firebase().db, "users") : null, user ? "users" : "none").data;
}
