import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { AppShell } from "@/components/app-shell";

// Mọi trang nội bộ yêu cầu session cookie hợp lệ (đã kiểm tra tên miền + user active).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
