import { z } from "zod";
import { SECTION_KEYS, SECTION_LABELS, type AppUser } from "@/lib/types";
import { loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { handle } from "@/server/http";
import { logActivity, sendMail } from "@/server/mail";

const Body = z.object({
  section: z.enum(SECTION_KEYS),
  text: z.string().trim().min(1).max(2000),
  mentions: z.array(z.string()).max(20).default([]),
});

// Bình luận theo section; @nhắc tên → gửi email cho người được nhắc.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/clients/[id]/comments">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);
  const body = Body.parse(await req.json());
  const db = adminDb();
  const ref = await db.collection("clients").doc(id).collection("comments").add({
    section: body.section,
    text: body.text,
    mentions: body.mentions,
    authorId: user.uid,
    authorName: user.displayName,
    authorPhoto: user.photoURL ?? null,
    createdAt: Date.now(),
  });
  const mentioned = await Promise.all(body.mentions.map((u) => db.collection("users").doc(u).get()));
  await sendMail(
    mentioned.map((s) => (s.data() as AppUser | undefined)?.email).filter(Boolean) as string[],
    `[BRANDO] ${user.displayName} nhắc bạn trong hồ sơ ${client.name}`,
    [`Mục: ${SECTION_LABELS[body.section]}`, body.text],
    `/clients/${id}`,
  );
  await logActivity(id, user.uid, user.displayName, "Bình luận", SECTION_LABELS[body.section]);
  return { id: ref.id };
});
