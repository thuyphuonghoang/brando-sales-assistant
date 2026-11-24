"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AppUser, Role } from "@/lib/types";
import { useCatalog, useUsers } from "@/hooks/firestore";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminPage() {
  const { user } = useAuth();
  const users = useUsers();
  const catalog = useCatalog();
  const [busy, setBusy] = useState(false);

  if (user?.role !== "admin") return <p className="text-sm text-destructive">Chỉ admin được truy cập trang này.</p>;

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api<{ prices: number; rules: number; industries: number; stats: number; packages: number; criteria: number; errors: string[] }>("/api/admin/sync", "POST");
      toast.success(`Đã đồng bộ: ${r.prices} dịch vụ, ${r.packages} gói chuẩn, ${r.criteria} tiêu chí, ${r.rules} quy tắc, ${r.industries} ngành, ${r.stats} số liệu`);
      r.errors.forEach((e) => toast.warning(e));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (u: AppUser, body: Partial<Pick<AppUser, "role" | "teamId" | "active">>) => {
    try {
      await api(`/api/admin/users/${u.uid}`, "PATCH", body);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Quản trị</h1>
      <Card>
        <CardHeader>
          <CardTitle>Dữ liệu từ Google Sheets</CardTitle>
          <CardDescription>
            Bảng giá, quy tắc gợi ý, checklist ngành và thư viện số liệu được cache vào Firestore. Sửa Sheet xong bấm “Đồng bộ lại”.
            Báo giá cũ không bị ảnh hưởng (đã lưu snapshot giá).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {catalog.prices.length} dịch vụ · {catalog.rules.length} quy tắc · {catalog.industries.length} ngành · {catalog.stats.length} số liệu
          </p>
          <p className="text-muted-foreground">
            Lần đồng bộ cuối: {catalog.syncedAt ? new Date(catalog.syncedAt).toLocaleString("vi-VN") : "chưa đồng bộ"}
          </p>
          <Button onClick={sync} disabled={busy} data-testid="sync-sheets">
            {busy ? "Đang đồng bộ…" : "Đồng bộ lại"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Người dùng</CardTitle>
          <CardDescription>Người dùng tự xuất hiện sau lần đăng nhập đầu tiên (mặc định vai trò Sales).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Hoạt động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell>{u.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                      value={u.role}
                      disabled={u.uid === user.uid}
                      onChange={(e) => patch(u, { role: e.target.value as Role })}
                    >
                      <option value="sales">Sales</option>
                      <option value="lead">Trưởng nhóm</option>
                      <option value="admin">Admin</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-32"
                      defaultValue={u.teamId}
                      onBlur={(e) => e.target.value && e.target.value !== u.teamId && patch(u, { teamId: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch checked={u.active} disabled={u.uid === user.uid} onCheckedChange={(v) => patch(u, { active: !!v })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
