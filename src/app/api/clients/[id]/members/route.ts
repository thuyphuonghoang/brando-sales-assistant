import { z } from "zod";
import type { AppUser } from "@/lib/types";
import { HttpError, loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";
import { logActivity, sendMail } from "@/server/mail";

const Body = z.object({
  ownerId: z.string().optional(),
  collaboratorIds: z.array(z.string()).max(20).optional(),
});

// Gán owner + collaborators. Chỉ owner hiện tại, lead (cùng nhóm) hoặc admin được đổi.
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/clients/[id]/members">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);
  if (user.role === "sales" && client.ownerId !== user.uid) {
    throw new HttpError(403, "Chỉ người phụ trách mới được mời người hỗ trợ");
  }
  const body = Body.parse(await req.json());
  const db = adminDb();
  const patch: Record<string, unknown> = { updatedAt: Date.now() };

  if (body.ownerId && body.ownerId !== client.ownerId) {
    if (user.role === "sales") throw new HttpError(403, "Chỉ trưởng nhóm hoặc admin được đổi người phụ trách");
    const owner = (await db.collection("users").doc(body.ownerId).get()).data() as AppUser | undefined;
    if (!owner) throw new HttpError(400, "Người phụ trách không tồn tại");
    patch.ownerId = owner.uid;
    patch.ownerName = owner.displayName;
    patch.teamId = owner.teamId;
  }
  if (body.collaboratorIds) {
    const added = body.collaboratorIds.filter((u) => !client.collaboratorIds.includes(u));
    patch.collaboratorIds = [...new Set(body.collaboratorIds)];
    const addedUsers = await Promise.all(added.map((u) => db.collection("users").doc(u).get()));
    await sendMail(
      addedUsers.map((s) => (s.data() as AppUser | undefined)?.email).filter(Boolean) as string[],
      `[BRANDO] ${user.displayName} mời bạn hỗ trợ khách hàng ${client.name}`,
      [`${user.displayName} đã thêm bạn vào hồ sơ khách hàng ${client.name}.`],
      `/clients/${id}`,
    );
  }
  await db.collection("clients").doc(id).update(patch);
  await logActivity(id, user.uid, user.displayName, "Cập nhật người phụ trách / người hỗ trợ");
  return { ok: true };
});
