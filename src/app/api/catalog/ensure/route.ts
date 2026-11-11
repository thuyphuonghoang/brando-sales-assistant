import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { ensureCatalog } from "@/server/google/sheets";

// Mọi người dùng đã đăng nhập đều gọi được: chỉ đồng bộ khi catalog còn trống.
export const POST = handle(async () => {
  const user = await requireUser();
  return { synced: await ensureCatalog(user.uid) };
});
