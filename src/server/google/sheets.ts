import "server-only";
// Đọc 4 Google Sheets nguồn và đồng bộ vào Firestore (collection "catalog").
import { google } from "googleapis";
import { FieldValue } from "firebase-admin/firestore";
import { parseIndustryTab, parsePrices, parseRules, parseStats } from "@/lib/sheets-parse";
import type { Industry, PriceItem, RuleRow, StatItem } from "@/lib/types";
import { adminDb } from "../firebase-admin";
import * as fx from "../fixtures/sheets";
import { googleAuth, googleMode, requireEnv } from "./index";

type Rows = (string | number)[][];

async function readTab(spreadsheetId: string, tabTitle?: string): Promise<Rows> {
  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  let title = tabTitle;
  if (!title) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    title = meta.data.sheets?.[0]?.properties?.title ?? "Sheet1";
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title.replace(/'/g, "''")}'`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (res.data.values ?? []) as Rows;
}

async function tabTitleByGid(spreadsheetId: string, gid?: string): Promise<string | undefined> {
  if (!gid) return undefined;
  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  return meta.data.sheets?.find((s) => String(s.properties?.sheetId) === gid)?.properties?.title ?? undefined;
}

async function readAllTabs(spreadsheetId: string): Promise<Record<string, Rows>> {
  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[];
  const out: Record<string, Rows> = {};
  if (titles.length === 0) return out;
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: titles.map((t) => `'${t.replace(/'/g, "''")}'`),
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  res.data.valueRanges?.forEach((vr, i) => (out[titles[i]] = (vr.values ?? []) as Rows));
  return out;
}

/** Ở chế độ mock, test có thể ghi đè dữ liệu "Sheet" qua document _mock/sheets. */
async function mockSource() {
  const snap = await adminDb().collection("_mock").doc("sheets").get();
  const o = (snap.data() ?? {}) as Record<string, string>;
  const parse = <T>(k: string, d: T): T => (o[k] ? (JSON.parse(o[k]) as T) : d);
  return {
    prices: parse<Rows>("priceRows", fx.priceRows),
    rules: parse<Rows>("ruleRows", fx.ruleRows),
    industries: parse<Record<string, Rows>>("industryTabs", fx.industryTabs),
    stats: parse<Rows>("statRows", fx.statRows),
  };
}

export interface SyncResult {
  prices: number;
  rules: number;
  industries: number;
  stats: number;
  errors: string[];
}

export async function syncSheetsToFirestore(byUid: string): Promise<SyncResult> {
  let src: { prices: Rows; rules: Rows; industries: Record<string, Rows>; stats: Rows };
  if (googleMode() === "mock") {
    src = await mockSource();
  } else {
    const priceId = requireEnv("PRICE_SHEET_ID");
    const [prices, rules, industries, stats] = await Promise.all([
      tabTitleByGid(priceId, process.env.PRICE_SHEET_GID).then((t) => readTab(priceId, t)),
      readTab(requireEnv("RULES_SHEET_ID")),
      readAllTabs(requireEnv("INDUSTRY_SHEET_ID")),
      readTab(requireEnv("STATS_SHEET_ID")),
    ]);
    src = { prices, rules, industries, stats };
  }

  const { items: prices, errors } = parsePrices(src.prices);
  const rules: RuleRow[] = parseRules(src.rules);
  const industries: Industry[] = Object.entries(src.industries).map(([t, rows]) => parseIndustryTab(t, rows));
  const stats: StatItem[] = parseStats(src.stats);

  const db = adminDb();
  const batch = db.batch();
  const cat = db.collection("catalog");
  batch.set(cat.doc("prices"), { items: prices satisfies PriceItem[] });
  batch.set(cat.doc("rules"), { items: rules });
  batch.set(cat.doc("industries"), { items: industries });
  batch.set(cat.doc("stats"), { items: stats });
  batch.set(cat.doc("meta"), { syncedAt: Date.now(), syncedBy: byUid, errors, serverTime: FieldValue.serverTimestamp() });
  await batch.commit();

  return { prices: prices.length, rules: rules.length, industries: industries.length, stats: stats.length, errors };
}

let ensuring: Promise<boolean> | null = null;

/**
 * Tự đồng bộ lần đầu: nếu catalog chưa từng được nạp (vd. emulator vừa khởi động lại, project mới)
 * thì đồng bộ ngay. Đã có dữ liệu thì không làm gì — cập nhật sau đó vẫn do admin bấm "Đồng bộ lại".
 * Trả về true nếu vừa đồng bộ.
 */
export async function ensureCatalog(byUid: string): Promise<boolean> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const meta = await adminDb().collection("catalog").doc("meta").get();
    if (meta.exists) return false;
    await syncSheetsToFirestore(byUid);
    return true;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

export async function loadCatalog() {
  const db = adminDb();
  const [p, r, i, s] = await Promise.all(
    ["prices", "rules", "industries", "stats"].map((d) => db.collection("catalog").doc(d).get()),
  );
  return {
    prices: (p.data()?.items ?? []) as PriceItem[],
    rules: (r.data()?.items ?? []) as RuleRow[],
    industries: (i.data()?.items ?? []) as Industry[],
    stats: (s.data()?.items ?? []) as StatItem[],
  };
}
