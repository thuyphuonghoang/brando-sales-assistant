import { z } from "zod";
import { loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";

const Body = z.object({ industry: z.string().trim().min(1).max(200) });

// Đổi ngành của khách (ngành ảnh hưởng checklist nhận định nên đi qua server, không ghi thẳng từ client).
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const client = await loadClientFor(user, id);
  const { industry } = Body.parse(await req.json());
  if (industry === client.industry) return { ok: true };
  await adminDb().collection("clients").doc(id).update({ industry, updatedAt: Date.now() });
  await logActivity(id, user.uid, user.displayName, `Đổi ngành: ${client.industry || "chưa có"} → ${industry}`);
  return { ok: true };
});
