import { loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { findBusiness, findCompetitors } from "@/server/google/places";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";

export const maxDuration = 60;

// Thu thập dữ liệu Google Business Profile + 3–5 đối thủ cùng loại, cùng khu vực.
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clients/[id]/research">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);

  const place = await findBusiness({ name: client.name, mapsUrl: client.inputs.mapsUrl });
  const competitors = place ? await findCompetitors(place, 5) : [];

  await adminDb()
    .collection("clients")
    .doc(id)
    .update({ place: place ?? null, competitors, researchedAt: Date.now(), updatedAt: Date.now() });
  await logActivity(id, user.uid, user.displayName, "Thu thập dữ liệu Google Business Profile và đối thủ");
  return { found: !!place, competitors: competitors.length };
});
