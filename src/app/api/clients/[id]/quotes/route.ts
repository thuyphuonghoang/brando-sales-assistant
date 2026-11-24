import { z } from "zod";
import { appConfig } from "@/lib/config";
import { buildLines, computeTotals, flexibleLines, needsApproval } from "@/lib/pricing";
import { allowedNumberSet, sanitizeText } from "@/lib/stats-guard";
import type { AppUser, Quote } from "@/lib/types";
import { loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { loadCatalog } from "@/server/google/sheets";
import { handle } from "@/server/http";
import { logActivity, sendMail } from "@/server/mail";

const Body = z.object({
  packageName: z.string().max(60).default("Tuỳ chỉnh"),
  items: z.array(z.object({ code: z.string(), quantity: z.number().positive().max(10_000) })).min(1).max(50),
  discountPercent: z.number().min(0).max(100).default(0),
  showBenefits: z.boolean().default(true),
  benefits: z.array(z.object({ text: z.string().max(500), statId: z.string().optional() })).max(10).default([]),
  paymentTerms: z.string().max(2000).optional(),
  timeline: z.string().max(2000).optional(),
});

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const ymd = (d: Date) => d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Tạo phiên bản báo giá mới. Giá lấy từ catalog (cache của PRICE_SHEET) và được SNAPSHOT vào báo giá;
// tiền được tính hoàn toàn ở server — client chỉ gửi mã dịch vụ + số lượng + % chiết khấu.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/clients/[id]/quotes">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);
  const body = Body.parse(await req.json());
  const catalog = await loadCatalog();

  const lines = buildLines(body.items, new Map(catalog.prices.map((p) => [p.code, p])));
  const totals = computeTotals(lines, body.discountPercent, appConfig.vatPercent);
  const overDiscount = needsApproval(body.discountPercent, appConfig.discountApprovalThreshold);
  const flexible = flexibleLines(lines);
  const pending = overDiscount || flexible.length > 0;

  const statsById = new Map(catalog.stats.map((s) => [s.id, s]));
  const allowed = allowedNumberSet(catalog.stats);
  const benefits = body.benefits
    .map((b) => {
      const s = b.statId ? statsById.get(b.statId) : undefined;
      const text = sanitizeText(b.text, allowed).text;
      return {
        text,
        ...(s
          ? { stat: { statId: s.id, text: s.stat_text, source_name: s.source_name, source_url: s.source_url, year: s.year } }
          : {}),
      };
    })
    .filter((b) => b.text !== "Không rõ");

  const db = adminDb();
  const quotesCol = db.collection("clients").doc(id).collection("quotes");
  const now = new Date();
  const quote = await db.runTransaction(async (tx) => {
    const existing = await tx.get(quotesCol.select("version"));
    const version = existing.docs.reduce((m, d) => Math.max(m, (d.get("version") as number) ?? 0), 0) + 1;
    const ref = quotesCol.doc();
    const q: Quote = {
      id: ref.id,
      clientId: id,
      version,
      status: pending ? "pending_approval" : "draft",
      packageName: body.packageName,
      lines,
      totals,
      showBenefits: body.showBenefits,
      benefits,
      paymentTerms: body.paymentTerms || appConfig.defaultPaymentTerms,
      timeline: body.timeline || appConfig.defaultTimeline,
      validityDays: appConfig.quoteValidityDays,
      issueDate: ymd(now),
      validUntil: ymd(addDays(now, appConfig.quoteValidityDays)),
      clientSnapshot: {
        name: client.name,
        industry: client.industry,
        ...(client.place?.address ? { address: client.place.address } : {}),
        ...(client.place?.phone ? { phone: client.place.phone } : {}),
      },
      ownerName: user.displayName,
      ownerEmail: user.email,
      createdBy: user.uid,
      createdAt: Date.now(),
      pdfUrl: null,
      docUrl: null,
      driveFolderUrl: null,
      approvedBy: null,
      approvedAt: null,
    };
    tx.set(ref, q);
    return q;
  });

  await logActivity(id, user.uid, user.displayName, `Tạo báo giá v${quote.version}`);
  if (pending) {
    const leads = await db.collection("users").where("teamId", "==", client.teamId).where("role", "==", "lead").get();
    await sendMail(
      leads.docs.map((d) => (d.data() as AppUser).email),
      `[BRANDO] Báo giá v${quote.version} cho ${client.name} chờ duyệt`,
      [
        ...(overDiscount
          ? [`${user.displayName} đề xuất chiết khấu ${body.discountPercent}% (vượt ngưỡng ${appConfig.discountApprovalThreshold}%).`]
          : []),
        ...(flexible.length
          ? [`Có ${flexible.length} hạng mục giá linh hoạt cần chốt giá: ${flexible.map((l) => l.name).join(", ")}.`]
          : []),
        `Khách hàng: ${client.name}.`,
      ],
      `/clients/${id}?tab=quotes`,
    );
  }
  return { id: quote.id, version: quote.version, status: quote.status, totals };
});
