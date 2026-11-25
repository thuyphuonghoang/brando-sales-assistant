import "server-only";
// Điểm vào cho mọi API Google. GOOGLE_MODE=mock dùng dữ liệu mẫu (không gọi mạng) để
// phát triển trên emulator và chạy test; GOOGLE_MODE=live gọi API thật.
// Chỉ nạp thư viện xác thực, không nạp cả gói googleapis (~hàng trăm API) để vừa RAM 512 MB của Render Free.
import { GoogleAuth } from "google-auth-library";

/**
 * Dữ liệu mẫu chỉ được dùng khi phát triển/chạy test. Bản chạy thật (NODE_ENV=production) luôn gọi API
 * thật kể cả khi GOOGLE_MODE=mock, để khách không bao giờ thấy dữ liệu ảo — trừ khi đặt ALLOW_MOCK_DATA=true
 * (vd. một bản demo nội bộ).
 */
export const mockAllowed = (): boolean =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_DATA === "true";

export const googleMode = (): "mock" | "live" =>
  process.env.GOOGLE_MODE === "live" || !mockAllowed() ? "live" : "mock";

/** Thiếu cấu hình để gọi dịch vụ thật → báo rõ cho người dùng thay vì "Lỗi máy chủ". */
export class ConfigError extends Error {}

let cachedAuth: GoogleAuth | null = null;

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
  cachedAuth = new GoogleAuth({
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
  if (!v) throw new ConfigError(`Chưa cấu hình ${name} trên máy chủ — admin cần đặt biến môi trường này.`);
  return v;
}
