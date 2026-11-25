"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useCatalog } from "@/hooks/firestore";
import type { Client } from "@/lib/types";

/** Chọn / đổi ngành ngay trên đầu hồ sơ khách. Ngành cũ không còn trong danh sách vẫn được giữ và hiển thị. */
export function IndustrySelect({ client }: { client: Client }) {
  const { industries } = useCatalog();
  const [busy, setBusy] = useState(false);
  const names = industries.map((i) => i.name);
  const options = client.industry && !names.includes(client.industry) ? [client.industry, ...names] : names;

  const change = async (industry: string) => {
    if (!industry || industry === client.industry) return;
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/industry`, "POST", { industry });
      toast.success(`Đã đổi ngành: ${industry}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      className="rounded-md border bg-background px-2 py-0.5 text-sm"
      aria-label="Ngành của khách"
      data-testid="client-industry"
      value={client.industry ?? ""}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
    >
      {!client.industry && <option value="">Chọn ngành…</option>}
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
