import { z } from "zod";
import type { Quote, QuoteStatus } from "@/lib/types";
import { QUOTE_STATUS_LABELS } from "@/lib/types";
import { HttpError, loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";
import { logActivity, sendMail } from "@/server/mail";

const Body = z.object({ action: z.enum(["approve", "decline_approval", "send", "accept", "reject"]) });

// Luồng trạng thái: Nháp → Đã gửi → Đồng ý / Từ chối; Chờ duyệt → (lead duyệt) → Nháp.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/clients/[id]/quotes/[qid]/status">) => {
  const user = await requireUser();
  const { id, qid } = await ctx.params;
  const client = await loadClientFor(user, id);
  const { action } = Body.parse(await req.json());
  const db = adminDb();
  const ref = db.collection("clients").doc(id).collection("quotes").doc(qid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy báo giá");
  const q = snap.data() as Quote;

  const isApprover = user.role === "admin" || (user.role === "lead" && user.teamId === client.teamId);
  let next: QuoteStatus;
  const patch: Record<string, unknown> = {};
  switch (action) {
    case "approve":
    case "decline_approval":
      if (!isApprover) throw new HttpError(403, "Chỉ trưởng nhóm hoặc admin được duyệt chiết khấu");
      if (q.status !== "pending_approval") throw new HttpError(400, "Báo giá không ở trạng thái Chờ duyệt");
      next = action === "approve" ? "draft" : "rejected";
      if (action === "approve") Object.assign(patch, { approvedBy: user.uid, approvedAt: Date.now() });
      break;
    case "send":
      if (q.status !== "draft") throw new HttpError(400, "Chỉ gửi được báo giá ở trạng thái Nháp (đã được duyệt nếu cần)");
      next = "sent";
      break;
    case "accept":
    case "reject":
      if (q.status !== "sent") throw new HttpError(400, "Chỉ cập nhật kết quả cho báo giá Đã gửi");
      next = action === "accept" ? "accepted" : "rejected";
      break;
  }
  await ref.update({ ...patch, status: next });

  const clientPatch: Record<string, unknown> = { updatedAt: Date.now() };
  if (next === "sent") clientPatch.status = "quoted";
  if (next === "accepted") clientPatch.status = "won";
  await db.collection("clients").doc(id).update(clientPatch);
  await logActivity(id, user.uid, user.displayName, `Báo giá v${q.version}: ${QUOTE_STATUS_LABELS[next]}`);

  if (action === "approve" || action === "decline_approval") {
    const creator = (await db.collection("users").doc(q.createdBy).get()).data();
    await sendMail(
      creator?.email ? [creator.email] : [],
      `[BRANDO] Báo giá v${q.version} cho ${client.name} ${action === "approve" ? "đã được duyệt" : "không được duyệt"}`,
      [`${user.displayName} đã ${action === "approve" ? "duyệt" : "từ chối"} chiết khấu ${q.totals.discountPercent}%.`],
      `/clients/${id}?tab=quotes`,
    );
  }
  return { status: next };
});
