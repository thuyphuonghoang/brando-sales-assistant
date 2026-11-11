import { z } from "zod";
import type { Client } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";

const url = z.string().trim().max(500).optional().or(z.literal(""));
const Body = z
  .object({
    name: z.string().trim().min(2).max(200),
    industry: z.string().trim().min(1),
    inputs: z.object({
      website: url,
      mapsUrl: url,
      fanpage: url,
      taxCode: z.string().trim().max(20).optional().or(z.literal("")),
      tiktok: url,
      instagram: url,
    }),
  })
  .refine((b) => Object.values(b.inputs).some((v) => v && v.trim() !== ""), {
    message: "Cần ít nhất một trong: website, Google Maps, fanpage, mã số thuế, TikTok, Instagram",
    path: ["inputs"],
  });

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  const now = Date.now();
  const ref = adminDb().collection("clients").doc();
  const client: Client = {
    id: ref.id,
    name: body.name,
    industry: body.industry,
    inputs: Object.fromEntries(Object.entries(body.inputs).filter(([, v]) => v)) as Client["inputs"],
    ownerId: user.uid,
    ownerName: user.displayName,
    collaboratorIds: [],
    teamId: user.teamId,
    status: "research",
    sections: { company_info: {}, online_presence: {}, competitors: {}, industry_notes: {}, meeting_notes: {} },
    business: {},
    place: null,
    competitors: [],
    researchedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(client);
  await logActivity(ref.id, user.uid, user.displayName, "Tạo hồ sơ khách hàng");
  return { id: ref.id };
});
