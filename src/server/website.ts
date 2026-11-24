import "server-only";
// Khám website của khách: tải trang chủ (chỉ đọc, như một trình duyệt) + điểm mobile từ Google PageSpeed.
// Không đăng nhập, không gửi form. Chặn địa chỉ nội bộ để URL do sales nhập không trỏ vào hạ tầng của mình.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { analyzeHtml } from "@/lib/website";
import type { WebsiteAudit } from "@/lib/types";
import { googleMode } from "./google";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export function normalizeUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  // Có scheme khác http/https (ftp://, file://, javascript:…) → bỏ, không tự thêm https:// phía trước.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null;
  if (/^(javascript|data|file|mailto|tel):/i.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** IP nội bộ / loopback / link-local / metadata cloud → không được tải. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

async function assertPublic(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Địa chỉ nội bộ");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.length === 0 || ips.some(isPrivateIp)) throw new Error("Địa chỉ nội bộ");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

async function fetchPage(start: URL): Promise<{ finalUrl: URL; status: number; html: string }> {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandoSalesAssistant/1.0)", Accept: "text/html,*/*;q=0.5" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Chuyển hướng không hợp lệ");
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    const html = type.includes("html") || type === "" ? await readCapped(res) : "";
    return { finalUrl: url, status: res.status, html };
  }
  throw new Error("Quá nhiều chuyển hướng");
}

/** Điểm hiệu năng mobile (0–100). PageSpeed chạy được không cần khoá (giới hạn thấp); có PAGESPEED_API_KEY thì dùng. */
async function mobileScore(url: string): Promise<number | null> {
  const q = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (process.env.PAGESPEED_API_KEY) q.set("key", process.env.PAGESPEED_API_KEY);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const s = j.lighthouseResult?.categories?.performance?.score;
    return typeof s === "number" ? Math.round(s * 100) : null;
  } catch {
    return null;
  }
}

export async function auditWebsite(raw: string): Promise<WebsiteAudit> {
  const checkedAt = Date.now();
  const u = normalizeUrl(raw);
  const empty = { hasViewport: false, hasPhone: false, hasBooking: false, hasMenu: false, hasPrices: false, hasSchema: false, social: {}, wordCount: 0 };
  if (!u) return { url: raw, reachable: false, https: false, mobileScore: null, checkedAt, error: "Link website không hợp lệ", ...empty };
  if (googleMode() === "mock") return mockAudit(u.toString(), checkedAt);

  try {
    const [page, score] = await Promise.all([fetchPage(u), mobileScore(u.toString())]);
    const ok = page.status >= 200 && page.status < 400;
    return {
      url: u.toString(),
      finalUrl: page.finalUrl.toString(),
      reachable: ok,
      https: page.finalUrl.protocol === "https:",
      status: page.status,
      mobileScore: score,
      checkedAt,
      ...(ok ? analyzeHtml(page.html) : empty),
      ...(ok ? {} : { error: `Website trả về mã ${page.status}` }),
    };
  } catch (e) {
    const msg = (e as Error).message;
    return {
      url: u.toString(),
      reachable: false,
      https: u.protocol === "https:",
      mobileScore: null,
      checkedAt,
      error: msg === "Địa chỉ nội bộ" ? "Link trỏ tới địa chỉ nội bộ, không kiểm tra" : "Không mở được website (sai link, web chết hoặc quá chậm)",
      ...empty,
    };
  }
}

function mockAudit(url: string, checkedAt: number): WebsiteAudit {
  return {
    url,
    finalUrl: url,
    reachable: true,
    https: url.startsWith("https:"),
    status: 200,
    title: "Trang mẫu (chế độ phát triển)",
    hasViewport: true,
    hasPhone: true,
    hasBooking: false,
    hasMenu: true,
    hasPrices: false,
    hasSchema: false,
    social: { facebook: "https://facebook.com/mau" },
    wordCount: 420,
    mobileScore: 48,
    checkedAt,
  };
}
