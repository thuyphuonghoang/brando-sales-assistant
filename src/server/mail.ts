import "server-only";
// Gửi email bằng cách ghi vào collection "mail" theo định dạng của Firebase Extension
// "Trigger Email from Firestore" (firebase/firestore-send-email). Cài extension đó trên
// project thật để email được gửi đi; trên emulator, email chỉ nằm trong collection để kiểm tra.
import { adminDb } from "./firebase-admin";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export async function sendMail(to: string[], subject: string, lines: string[], link?: string) {
  if (to.length === 0) return;
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  const html =
    lines.map((l) => `<p>${esc(l)}</p>`).join("") +
    (link ? `<p><a href="${esc(base + link)}">Mở trong BRANDO Sales Assistant</a></p>` : "");
  await adminDb().collection("mail").add({ to, message: { subject, html }, createdAt: Date.now() });
}

export async function logActivity(clientId: string, uid: string, name: string, action: string, field?: string) {
  await adminDb()
    .collection("clients")
    .doc(clientId)
    .collection("activity")
    .add({ uid, name, action, field: field ?? null, at: Date.now() });
}
