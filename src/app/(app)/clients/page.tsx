"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, type Query } from "firebase/firestore";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { firebase } from "@/lib/firebase/client";
import { CLIENT_STATUS_LABELS, type Client, type ClientStatus } from "@/lib/types";
import { useCatalog, useQuery, useUsers } from "@/hooks/firestore";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Danh sách khách theo quyền: admin → tất cả; lead → cả nhóm; sales → mình phụ trách + được mời. */
function useVisibleClients(): { clients: Client[]; loading: boolean } {
  const { user } = useAuth();
  const db = firebase().db;
  const col = collection(db, "clients");
  const mk = (q: Query | null) => (q ? () => q : null);
  const primary: Query | null = !user
    ? null
    : user.role === "admin"
      ? col
      : user.role === "lead"
        ? query(col, where("teamId", "==", user.teamId))
        : query(col, where("ownerId", "==", user.uid));
  const secondary: Query | null = user ? query(col, where("collaboratorIds", "array-contains", user.uid)) : null;
  const a = useQuery<Client>(mk(primary), `clients-a-${user?.uid}-${user?.role}-${user?.teamId}`);
  const b = useQuery<Client>(mk(secondary), `clients-b-${user?.uid}`);
  const clients = useMemo(() => {
    const m = new Map<string, Client>();
    [...a.data, ...b.data].forEach((c) => m.set(c.id, c));
    return [...m.values()].sort((x, y) => y.updatedAt - x.updatedAt);
  }, [a.data, b.data]);
  return { clients, loading: a.loading };
}

const STATUS_VARIANT: Record<ClientStatus, "default" | "secondary" | "outline" | "destructive"> = {
  research: "outline",
  assessed: "secondary",
  meeting: "secondary",
  quoted: "default",
  won: "default",
  lost: "destructive",
};

export default function ClientsPage() {
  const { clients, loading } = useVisibleClients();
  const users = useUsers();
  const { industries } = useCatalog();
  const [industry, setIndustry] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = clients.filter(
    (c) =>
      (!industry || c.industry === industry) &&
      (!owner || c.ownerId === owner) &&
      (!status || c.status === status) &&
      (!search || c.name.toLowerCase().includes(search.toLowerCase())),
  );
  const select = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <Button onClick={() => setOpen(true)}>+ Khách hàng mới</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="w-full sm:w-56" placeholder="Tìm theo tên…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={select} value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Lọc ngành">
          <option value="">Mọi ngành</option>
          {industries.map((i) => (
            <option key={i.id} value={i.name}>
              {i.name}
            </option>
          ))}
        </select>
        <select className={select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Lọc người phụ trách">
          <option value="">Mọi người phụ trách</option>
          {users.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.displayName}
            </option>
          ))}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {Object.entries(CLIENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doanh nghiệp</TableHead>
              <TableHead className="hidden sm:table-cell">Ngành</TableHead>
              <TableHead className="hidden md:table-cell">Người phụ trách</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="hidden md:table-cell">Cập nhật</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Đang tải…
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Chưa có khách hàng nào.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground sm:hidden">{c.industry}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{c.industry}</TableCell>
                <TableCell className="hidden md:table-cell">{c.ownerName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[c.status]}>{CLIENT_STATUS_LABELS[c.status]}</Badge>
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {new Date(c.updatedAt).toLocaleString("vi-VN")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewClientDialog open={open} onOpenChange={setOpen} industries={industries.map((i) => i.name)} />
    </div>
  );
}

/** Danh sách ngành trống: thử đồng bộ ngay (tự động nếu catalog chưa từng nạp; admin được ép đồng bộ lại). */
function SyncIndustriesHint() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user?.role === "admin") {
        const r = await api<{ industries: number }>("/api/admin/sync", "POST");
        if (r.industries === 0) setError("Đã đồng bộ nhưng Sheet ngành chưa có tab nào.");
      } else {
        const r = await api<{ synced: boolean }>("/api/catalog/ensure", "POST");
        if (!r.synced) setError("Dữ liệu đã được đồng bộ trước đó nhưng chưa có ngành nào.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1 text-xs text-amber-600">
      <p>Chưa có danh sách ngành.</p>
      <Button type="button" size="xs" variant="outline" onClick={run} disabled={busy} data-testid="sync-industries">
        {busy ? "Đang đồng bộ…" : "Đồng bộ ngay"}
      </Button>
      {error && (
        <p className="text-destructive">
          {error}
          {user?.role !== "admin" && " — nhờ admin kiểm tra cấu hình Google Sheets."}
        </p>
      )}
    </div>
  );
}

const CHANNELS = [
  ["website", "Website"],
  ["mapsUrl", "Link Google Maps"],
  ["fanpage", "Fanpage Facebook"],
  ["taxCode", "Mã số thuế"],
  ["tiktok", "TikTok"],
  ["instagram", "Instagram"],
] as const;

function NewClientDialog({
  open,
  onOpenChange,
  industries,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  industries: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const hasChannel = Object.values(inputs).some((v) => v.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/clients", "POST", { name, industry, inputs });
      onOpenChange(false);
      router.push(`/clients/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Khách hàng mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Tên doanh nghiệp *</Label>
            <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-industry">Ngành *</Label>
            <select
              id="c-industry"
              required
              className="w-full rounded-md border bg-background px-2 py-2 text-sm"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              <option value="">Chọn ngành…</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            {industries.length === 0 && <SyncIndustriesHint />}
          </div>
          <p className="text-xs text-muted-foreground">Nhập ít nhất một kênh:</p>
          {CHANNELS.map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`c-${k}`}>{label}</Label>
              <Input id={`c-${k}`} value={inputs[k] ?? ""} onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} />
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={busy || !name || !industry || !hasChannel}>
            Tạo hồ sơ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
