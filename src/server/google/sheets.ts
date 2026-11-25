import "server-only";
// Đọc 4 Google Sheets nguồn và đồng bộ vào Firestore (collection "catalog").
import { sheets as sheetsApi } from "@googleapis/sheets";
import { FieldValue } from "firebase-admin/firestore";
import { parseCases, parseIndustryTab, parsePrices, parseRules, parseStandardPackages, parseStats } from "@/lib/sheets-parse";
import type { CaseDef, Industry, PriceItem, RuleRow, StandardPackage, StatItem } from "@/lib/types";
import { adminDb } from "../firebase-admin";
import * as fx from "../fixtures/sheets";
import { googleAuth, googleMode, requireEnv } from "./index";

type Rows = (string | number)[][];

async function readTab(spreadsheetId: string, tabTitle?: string): Promise<Rows> {
  const sheets = sheetsApi({ version: "v4", auth: googleAuth() });
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
  const sheets = sheetsApi({ version: "v4", auth: googleAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  return meta.data.sheets?.find((s) => String(s.properties?.sheetId) === gid)?.properties?.title ?? undefined;
}

async function readAllTabs(spreadsheetId: string): Promise<Record<string, Rows>> {
  const sheets = sheetsApi({ version: "v4", auth: googleAuth() });
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
    packages: parse<Rows>("packageRows", fx.packageRows),
    cases: parse<Rows>("caseRows", fx.caseRows),
  };
}

export interface SyncResult {
  prices: number;
  rules: number;
  industries: number;
  stats: number;
  packages: number;
  errors: string[];
}

type Source = {
  prices: Rows;
  rules: Rows;
  industries: Record<string, Rows>;
  stats: Rows;
  packages: Rows;
  cases: Rows;
};

/** Tab có tên cố định trong Bộ chuẩn; thiếu tab thì trả [] để phần còn lại vẫn đồng bộ được. */
async function readNamedTab(spreadsheetId: string, title: string, errors: string[]): Promise<Rows> {
  try {
    return await readTab(spreadsheetId, title);
  } catch {
    errors.push(`Không đọc được tab "${title}" trong sheet ${spreadsheetId}`);
    return [];
  }
}

/** Sheet tuỳ chọn: chưa đặt biến môi trường thì bỏ qua (kèm cảnh báo) thay vì làm hỏng cả lần đồng bộ. */
async function optional<T>(envName: string, empty: T, errors: string[], read: (id: string) => Promise<T>): Promise<T> {
  const id = process.env[envName];
  if (!id) {
    errors.push(`Chưa cấu hình ${envName} — bỏ qua phần này`);
    return empty;
  }
  return read(id);
}

export async function syncSheetsToFirestore(byUid: string): Promise<SyncResult> {
  const warnings: string[] = [];
  let src: Source;
  if (googleMode() === "mock") {
    src = await mockSource();
  } else {
    const priceId = requireEnv("PRICE_SHEET_ID");
    // Gói + Case nằm trong Bộ chuẩn; mặc định chính là sheet chứa bảng giá.
    const standardId = process.env.STANDARD_SHEET_ID || priceId;
    const [prices, rules, industries, stats, packages, cases] = await Promise.all([
      tabTitleByGid(priceId, process.env.PRICE_SHEET_GID).then((t) => readTab(priceId, t)),
      optional("RULES_SHEET_ID", [] as Rows, warnings, (id) => readTab(id)),
      optional("INDUSTRY_SHEET_ID", {} as Record<string, Rows>, warnings, (id) => readAllTabs(id)),
      optional("STATS_SHEET_ID", [] as Rows, warnings, (id) => readTab(id)),
      readNamedTab(standardId, "Gói", warnings),
      readNamedTab(standardId, "Case", warnings),
    ]);
    src = { prices, rules, industries, stats, packages, cases };
  }

  const { items: prices, errors: priceErrors } = parsePrices(src.prices);
  const rules: RuleRow[] = parseRules(src.rules);
  const industries: Industry[] = Object.entries(src.industries).map(([t, rows]) => parseIndustryTab(t, rows));
  const stats: StatItem[] = parseStats(src.stats);
  const { items: packages, errors: packageErrors } = parseStandardPackages(src.packages, prices);
  const cases: CaseDef[] = parseCases(src.cases);
  const errors = [...warnings, ...priceErrors, ...packageErrors];

  const db = adminDb();
  const batch = db.batch();
  const cat = db.collection("catalog");
  batch.set(cat.doc("prices"), { items: prices satisfies PriceItem[] });
  batch.set(cat.doc("rules"), { items: rules });
  batch.set(cat.doc("industries"), { items: industries });
  batch.set(cat.doc("stats"), { items: stats });
  batch.set(cat.doc("packages"), { items: packages satisfies StandardPackage[], cases });
  batch.set(cat.doc("meta"), { syncedAt: Date.now(), syncedBy: byUid, errors, serverTime: FieldValue.serverTimestamp() });
  await batch.commit();

  return {
    prices: prices.length,
    rules: rules.length,
    industries: industries.length,
    stats: stats.length,
    packages: packages.length,
    errors,
  };
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
  const [p, r, i, s, k] = await Promise.all(
    ["prices", "rules", "industries", "stats", "packages"].map((d) => db.collection("catalog").doc(d).get()),
  );
  return {
    prices: (p.data()?.items ?? []) as PriceItem[],
    rules: (r.data()?.items ?? []) as RuleRow[],
    industries: (i.data()?.items ?? []) as Industry[],
    stats: (s.data()?.items ?? []) as StatItem[],
    packages: (k.data()?.items ?? []) as StandardPackage[],
    cases: (k.data()?.cases ?? []) as CaseDef[],
  };
}
