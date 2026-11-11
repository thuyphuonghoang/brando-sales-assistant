import "server-only";
// Điểm vào cho mọi API Google. GOOGLE_MODE=mock dùng dữ liệu mẫu (không gọi mạng) để
// phát triển trên emulator và chạy test; GOOGLE_MODE=live gọi API thật.
import { google } from "googleapis";

export const googleMode = (): "mock" | "live" => (process.env.GOOGLE_MODE === "live" ? "live" : "mock");

let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

/**
 * Service account cho Sheets / Docs / Drive. Lưu ý: service account không có dung lượng Drive
 * riêng — ROOT_FOLDER_ID nên nằm trong Shared Drive (service account là thành viên), hoặc đặt
 * GOOGLE_IMPERSONATE_USER (cần domain-wide delegation) để tạo file dưới danh nghĩa một user.
 */
export function googleAuth() {
  if (cachedAuth) return cachedAuth;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credentials = raw
    ? JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"))
    : undefined;
  cachedAuth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive",
    ],
    clientOptions: process.env.GOOGLE_IMPERSONATE_USER
      ? { subject: process.env.GOOGLE_IMPERSONATE_USER }
      : undefined,
  });
  return cachedAuth;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}
