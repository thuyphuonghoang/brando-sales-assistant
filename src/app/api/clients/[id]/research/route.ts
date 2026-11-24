import { loadClientFor, requireUser } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { ConfigError } from "@/server/google";
import { findBusiness, findCompetitors } from "@/server/google/places";
import { handle } from "@/server/http";
import { logActivity } from "@/server/mail";
import { auditWebsite } from "@/server/website";

export const maxDuration = 60;

// Thu thập dữ liệu: Google Business Profile + 3–5 đối thủ cùng loại, cùng khu vực, và khám website (nếu có link).
// Thiếu khoá Places thì vẫn khám website; phần Maps báo rõ là chưa cấu hình (không dùng dữ liệu mẫu).
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/clients/[id]/research">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const client = await loadClientFor(user, id);

  const maps = (async () => {
    try {
      const place = await findBusiness({ name: client.name, mapsUrl: client.inputs.mapsUrl });
      const competitors = place ? await findCompetitors(place, 5) : [];
      return { place, competitors, mapsError: null as string | null };
    } catch (e) {
      if (e instanceof ConfigError) return { place: null, competitors: [], mapsError: "Chưa cấu hình khoá Google Places — sales nhập tay số liệu Maps." };
      throw e;
    }
  })();
  const site = client.inputs.website ? auditWebsite(client.inputs.website) : Promise.resolve(null);
  const [{ place, competitors, mapsError }, website] = await Promise.all([maps, site]);

  const update: Record<string, unknown> = { website, mapsError, researchedAt: Date.now(), updatedAt: Date.now() };
  // Chưa có khoá Places thì giữ dữ liệu Maps cũ (nếu có), không ghi đè bằng rỗng.
  if (!mapsError) Object.assign(update, { place: place ?? null, competitors });
  await adminDb().collection("clients").doc(id).update(update);
  await logActivity(id, user.uid, user.displayName, website ? "Thu thập dữ liệu Google Maps, đối thủ và website" : "Thu thập dữ liệu Google Maps và đối thủ");
  return { found: !!place, competitors: competitors.length, website: !!website, mapsError };
});
