import type { Quote } from "@/lib/types";
import { HttpError, loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { generateQuoteFiles } from "@/server/google/docs";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";

export const maxDuration = 120;

// Tạo Google Docs từ mẫu → PDF → lưu Drive ROOT_FOLDER_ID/<tên khách>/ → trả link.
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clients/[id]/quotes/[qid]/pdf">) => {
  const user = await requireUser();
  const { id, qid } = await ctx.params;
  const client = await loadClientFor(user, id);
  const db = adminDb();
  const ref = db.collection("clients").doc(id).collection("quotes").doc(qid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy báo giá");
  const q = snap.data() as Quote;
  if (q.status === "pending_approval") throw new HttpError(400, "Báo giá đang chờ duyệt chiết khấu, chưa xuất PDF được");

  const clientRef = db.collection("clients").doc(id);
  const folderId = ((await clientRef.get()).get("driveFolderId") as string | undefined) ?? null;
  const files = await generateQuoteFiles(q, folderId);
  await ref.update({ pdfUrl: files.pdfUrl, docUrl: files.docUrl, driveFolderUrl: files.folderUrl, drivePath: files.path });
  if (!folderId) await clientRef.update({ driveFolderId: files.folderId });
  await logActivity(id, user.uid, user.displayName, `Xuất PDF báo giá v${q.version} cho ${client.name}`);
  return files;
});
