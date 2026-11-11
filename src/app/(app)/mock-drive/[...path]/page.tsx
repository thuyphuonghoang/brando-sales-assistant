import { notFound } from "next/navigation";
import { adminDb } from "@/server/firebase-admin";
import { googleMode } from "@/server/google";

// Chỉ dùng khi GOOGLE_MODE=mock: xem "file" báo giá giả lập đã được ghi vào đâu và với dữ liệu gì.
export default async function MockDrivePage({ params }: PageProps<"/mock-drive/[...path]">) {
  if (googleMode() !== "mock") notFound();
  const { path } = await params;
  const full = decodeURIComponent(path.join("/"));
  const col = adminDb().collection("_mock").doc("drive").collection("files");
  const snap = await col.where("path", "==", full.endsWith(".pdf") ? full : `${full}.pdf`).limit(1).get();
  const folder = snap.empty ? await col.where("folder", "==", full).get() : null;
  return (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold">Drive giả lập (GOOGLE_MODE=mock)</h1>
      <p>
        Đường dẫn: <code data-testid="mock-path">{full}</code>
      </p>
      {!snap.empty && (
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(snap.docs[0].data(), null, 2)}</pre>
      )}
      {folder && (
        <ul className="list-disc pl-5">
          {folder.docs.map((d) => (
            <li key={d.id}>{d.get("path")}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
