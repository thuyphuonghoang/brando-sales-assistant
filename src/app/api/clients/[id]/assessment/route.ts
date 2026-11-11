import { z } from "zod";
import { enforceStatsLibrary, scoreFromScorecard } from "@/lib/stats-guard";
import type { Assessment, AssessmentDoc } from "@/lib/types";
import { HttpError, loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { generateAssessment, geminiModel } from "@/server/google/gemini";
import { loadCatalog } from "@/server/google/sheets";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";

export const maxDuration = 120;

const docRef = (id: string) => adminDb().collection("clients").doc(id).collection("assessment").doc("current");

// POST: chạy Gemini tạo nhận định mới (ghi đè bản AI gốc, xoá bản đã sửa cũ).
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clients/[id]/assessment">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);
  const catalog = await loadCatalog();
  const industry = catalog.industries.find((i) => i.name === client.industry);
  if (!industry) throw new HttpError(400, `Chưa có checklist cho ngành "${client.industry}". Admin cần đồng bộ lại Sheets.`);
  const stats = catalog.stats.filter((s) => s.industry === "*" || s.industry === client.industry);
  const problemCodes = [
    ...new Set(catalog.rules.filter((r) => r.industry === "*" || r.industry === client.industry).map((r) => r.problem_code)),
  ];
  if (problemCodes.length === 0) throw new HttpError(400, "RULES_SHEET chưa có problem_code nào");

  const ai = await generateAssessment({ client, industry, stats, problemCodes });
  const doc: AssessmentDoc = { ai, edited: null, model: geminiModel(), generatedAt: Date.now(), generatedBy: user.uid };
  await docRef(id).set(doc);
  await adminDb()
    .collection("clients")
    .doc(id)
    .update({ status: client.status === "research" ? "assessed" : client.status, updatedAt: Date.now() });
  await logActivity(id, user.uid, user.displayName, "Tạo nhận định bằng AI");
  return { ok: true, removedSentences: ai.removedSentences ?? 0 };
});

const Edited = z.object({
  scorecard: z.array(
    z.object({
      item_code: z.string(),
      label: z.string(),
      result: z.enum(["Đạt", "Chưa đạt", "Không rõ"]),
      evidence: z.string(),
      weight: z.number(),
    }),
  ),
  competitorComparison: z.string(),
  funnelGap: z.enum(["BIẾT", "HIỂU", "TIN", "MUA", "Không rõ"]),
  funnelReason: z.string(),
  problems: z.array(z.object({ problem_code: z.string(), title: z.string(), detail: z.string(), statIds: z.array(z.string()) })).max(3),
  opportunities: z.array(z.string()),
  pitch4T: z.object({ tacDung: z.string(), tuongXung: z.string(), tinTuong: z.string(), tangTruong: z.string() }),
  objections: z.array(z.object({ objection: z.string(), response: z.string() })),
});

// PUT: lưu bản sales đã sửa. Bản AI gốc giữ nguyên. Bản sửa cũng đi qua bộ lọc số liệu.
export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/clients/[id]/assessment">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await loadClientFor(user, id);
  const snap = await docRef(id).get();
  if (!snap.exists) throw new HttpError(400, "Chưa có nhận định để sửa");
  const body = Edited.parse(await req.json());
  const { stats } = await loadCatalog();
  const draft: Assessment = { ...body, score: scoreFromScorecard(body.scorecard), stats: [] };
  const edited = enforceStatsLibrary(draft, stats);
  await docRef(id).update({ edited, editedAt: Date.now(), editedBy: user.uid });
  await logActivity(id, user.uid, user.displayName, "Sửa nhận định");
  return { ok: true, removedSentences: edited.removedSentences ?? 0 };
});

// DELETE: bỏ bản sửa, quay về bản AI gốc.
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/clients/[id]/assessment">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await loadClientFor(user, id);
  await docRef(id).update({ edited: null, editedAt: Date.now(), editedBy: user.uid });
  await logActivity(id, user.uid, user.displayName, "Khôi phục nhận định AI gốc");
  return { ok: true };
});
