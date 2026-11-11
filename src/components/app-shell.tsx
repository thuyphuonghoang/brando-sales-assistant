"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./collab-widgets";
import { cn } from "@/lib/utils";

const ROLE_LABEL = { sales: "Sales", lead: "Trưởng nhóm", admin: "Admin" } as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, fbUser, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  // Có session cookie nhưng Firebase Auth phía trình duyệt đã mất → đăng nhập lại.
  useEffect(() => {
    if (!loading && !fbUser) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, fbUser, router, path]);

  // Catalog trống (lần chạy đầu / emulator vừa khởi động lại) → tự đồng bộ từ Google Sheets.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    api<{ synced: boolean }>("/api/catalog/ensure", "POST")
      .then((r) => r.synced && toast.success("Đã tự đồng bộ bảng giá, ngành và số liệu từ Google Sheets"))
      .catch((e) => toast.error(`Chưa đồng bộ được dữ liệu từ Google Sheets: ${(e as Error).message}`));
  }, [uid]);

  if (loading || !user) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Đang tải…</div>;
  }
  if (!user.active) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
        <p>Tài khoản của bạn đã bị khoá. Liên hệ admin.</p>
        <Button variant="outline" size="sm" onClick={signOut}>
          Đăng xuất
        </Button>
      </div>
    );
  }

  const nav = [
    { href: "/clients", label: "Khách hàng" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Quản trị" }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/clients" className="font-semibold tracking-tight">
            BRANDO <span className="hidden text-muted-foreground sm:inline">Sales</span>
          </Link>
          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                  path.startsWith(n.href) && "bg-muted font-medium",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right text-xs leading-tight sm:block">
              <div className="font-medium" data-testid="current-user">{user.displayName}</div>
              <div className="text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <UserAvatar name={user.displayName} photo={user.photoURL} className="size-8" />
            <Button variant="ghost" size="sm" onClick={signOut}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
