import { z } from "zod";
import { requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";

const Body = z.object({
  role: z.enum(["sales", "lead", "admin"]).optional(),
  teamId: z.string().min(1).max(60).optional(),
  active: z.boolean().optional(),
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/users/[uid]">) => {
  await requireUser(["admin"]);
  const { uid } = await ctx.params;
  const patch = Body.parse(await req.json());
  await adminDb().collection("users").doc(uid).update(patch);
  return { ok: true };
});
