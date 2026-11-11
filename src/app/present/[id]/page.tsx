import { redirect, notFound } from "next/navigation";
import { toPresentation } from "@/lib/present";
import type { AssessmentDoc } from "@/lib/types";
import { getSessionUser, HttpError, loadClientFor } from "@/server/auth";
import { adminDb } from "@/server/firebase-admin";
import { PresentMeetingForm } from "./meeting-form";

// Chế độ trình bày cho khách. Render hoàn toàn ở server và CHỈ dùng dữ liệu đã qua toPresentation()
// (whitelist) — ghi chú nội bộ, gợi ý câu nói, phản đối, bình luận không bao giờ được gửi xuống trình duyệt.
export default async function PresentPage({ params }: PageProps<"/present/[id]">) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/present/${id}`);
  let client;
  try {
    client = await loadClientFor(user, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const snap = await adminDb().collection("clients").doc(id).collection("assessment").doc("current").get();
  const data = toPresentation(client, snap.exists ? (snap.data() as AssessmentDoc) : null);

  const resultColor = (r: string) =>
    r === "Đạt" ? "bg-emerald-100 text-emerald-800" : r === "Chưa đạt" ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 bg-white px-4 py-8 text-neutral-900 sm:px-8">
      <header className="space-y-1">
        <p className="text-sm tracking-widest text-neutral-500 uppercase">BRANDO · Đánh giá hiện diện trực tuyến</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{data.clientName}</h1>
        <p className="text-neutral-600">{data.industry}</p>
      </header>

      <section className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl bg-neutral-900 p-6 text-white">
          <div className="text-5xl font-bold">{data.score ?? "—"}</div>
          <div className="text-sm opacity-80">/100 điểm hiện diện</div>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Điểm hiện diện</h2>
          {data.scorecard.length === 0 ? (
            <p className="text-neutral-500">Không rõ</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.scorecard.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <span>{r.label}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${resultColor(r.result)}`}>{r.result}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">So sánh với đối thủ trong khu vực</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="p-2">Doanh nghiệp</th>
                <th className="p-2">Điểm sao</th>
                <th className="p-2">Số đánh giá</th>
                <th className="p-2">Ảnh</th>
              </tr>
            </thead>
            <tbody>
              {data.place && (
                <tr className="border-b bg-amber-50 font-medium">
                  <td className="p-2">{data.clientName}</td>
                  <td className="p-2">{data.place.rating ?? "Không rõ"}</td>
                  <td className="p-2">{data.place.reviewCount ?? "Không rõ"}</td>
                  <td className="p-2">{data.place.photoCount != null ? (data.place.photoCount >= 10 ? "≥ 10" : data.place.photoCount) : "Không rõ"}</td>
                </tr>
              )}
              {data.competitors.map((c) => (
                <tr key={c.name} className="border-b">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.rating ?? "Không rõ"}</td>
                  <td className="p-2">{c.reviewCount ?? "Không rõ"}</td>
                  <td className="p-2">{c.photoCount != null ? (c.photoCount >= 10 ? "≥ 10" : c.photoCount) : "Không rõ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-neutral-700">{data.competitorComparison}</p>
        <p className="mt-1 text-xs text-neutral-400">Nguồn: Google Maps (Google Places API)</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3 vấn đề ưu tiên</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {data.problems.map((p, i) => (
            <li key={i} className="rounded-xl border p-4">
              <div className="text-3xl font-bold text-neutral-300">{i + 1}</div>
              <div className="font-semibold">{p.title}</div>
              <p className="text-sm text-neutral-600">{p.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Cơ hội</h2>
        <ul className="list-disc space-y-1 pl-5">
          {data.opportunities.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      </section>

      {data.stats.length > 0 && (
        <section className="text-xs text-neutral-500">
          <h3 className="font-medium">Nguồn số liệu</h3>
          <ul>
            {data.stats.map((s, i) => (
              <li key={i}>
                {s.text} — {s.source_name} ({s.year})
              </li>
            ))}
          </ul>
        </section>
      )}

      <PresentMeetingForm clientId={id} />
    </main>
  );
}
