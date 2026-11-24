// Phân tích HTML trang chủ của khách (thuần logic, test được). Phần tải trang nằm ở src/server/website.ts.
import type { WebsiteAudit } from "./types";

const SOCIAL: [keyof WebsiteAudit["social"], RegExp][] = [
  ["facebook", /https?:\/\/(?:www\.|m\.)?(?:facebook|fb)\.com\/[^\s"'<>]+/i],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/i],
  ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>]+/i],
  ["tripadvisor", /https?:\/\/(?:www\.)?tripadvisor\.[a-z.]+\/[^\s"'<>]+/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/i],
  ["zalo", /https?:\/\/(?:www\.)?zalo\.me\/[^\s"'<>]+/i],
];

const BOOKING = /(đặt bàn|đặt lịch|đặt phòng|đặt chỗ|book now|booking|reservation|reserve a table|tablecheck|diningcity|pasgo|booking\.com|agoda)/i;
const MENU = /(thực đơn|menu|bảng giá|price list)/i;
// Giá kiểu 45.000đ, 45,000 VND, 45k, 120.000 ₫
const PRICE = /\b\d{1,3}(?:[.,]\d{3})+\s*(?:đ|₫|vnd|vnđ)|\b\d{2,4}\s*k\b/i;
const PHONE = /(?:tel:|\b)(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/;

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || undefined;
}

export function analyzeHtml(html: string): Omit<WebsiteAudit, "url" | "finalUrl" | "reachable" | "https" | "status" | "mobileScore" | "checkedAt" | "error"> {
  const body = text(html);
  const social: WebsiteAudit["social"] = {};
  for (const [k, re] of SOCIAL) {
    const m = html.match(re);
    if (m) social[k] = m[0].replace(/["'].*$/, "");
  }
  return {
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined,
    description: meta(html, "description") ?? meta(html, "og:description"),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    hasPhone: /href=["']tel:/i.test(html) || PHONE.test(body),
    hasBooking: BOOKING.test(body) || BOOKING.test(html.match(/href=["'][^"']+["']/gi)?.join(" ") ?? ""),
    hasMenu: MENU.test(body),
    hasPrices: PRICE.test(body),
    hasSchema: /application\/ld\+json/i.test(html) && /(LocalBusiness|Restaurant|Hotel|LodgingBusiness|Organization|Store)/.test(html),
    social,
    wordCount: body ? body.split(" ").length : 0,
  };
}
