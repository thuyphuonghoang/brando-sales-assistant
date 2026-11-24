// Chuyển dữ liệu thô từ Google Sheets (mảng các hàng) thành object catalog.
// Hàng đầu tiên là tiêu đề cột; tên cột không phân biệt hoa thường/khoảng trắng.
import type { CaseDef, ChecklistItem, Criterion, Industry, PriceItem, RuleRow, StandardPackage, StatItem } from "./types";

type Row = (string | number | null | undefined)[];

function toRecords(rows: Row[]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_"));
  return rows
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

/** "1.500.000", "1,500,000 ₫", "1500000" → 1500000 */
export function parseVndNumber(s: string): number {
  const d = String(s).replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function parsePrices(rows: Row[]): { items: PriceItem[]; errors: string[] } {
  const errors: string[] = [];
  const items: PriceItem[] = [];
  toRecords(rows).forEach((r, i) => {
    const price = parseVndNumber(r.price);
    if (!r.code || !Number.isFinite(price)) {
      errors.push(`Bảng giá hàng ${i + 2}: thiếu code hoặc giá không hợp lệ`);
      return;
    }
    items.push({
      code: r.code,
      name: r.name,
      group: r.group,
      description: r.description,
      unit: r.unit,
      price,
      effective_from: r.effective_from,
    });
  });
  return { items, errors };
}

export function parseRules(rows: Row[]): RuleRow[] {
  return toRecords(rows)
    .filter((r) => r.problem_code)
    .map((r) => ({
      industry: r.industry || "*",
      problem_code: r.problem_code,
      service_codes: (r.service_codes || "")
        .split(/[,;\n]/)
        .map((c) => c.trim())
        .filter(Boolean),
    }));
}

export function parseIndustryTab(tabName: string, rows: Row[]): Industry {
  const checklist: ChecklistItem[] = toRecords(rows)
    .filter((r) => r.item_code)
    .map((r) => ({
      item_code: r.item_code,
      label: r.label,
      how_to_check: r.how_to_check,
      weight: Number(r.weight) || 1,
    }));
  return { id: slugify(tabName), name: tabName, checklist };
}

export function parseStats(rows: Row[]): StatItem[] {
  return toRecords(rows)
    .filter((r) => r.stat_text)
    .map((r) => ({
      id: "s_" + hash(`${r.industry}|${r.stat_text}|${r.source_name}`),
      industry: r.industry || "*",
      stat_text: r.stat_text,
      value: r.value,
      source_name: r.source_name,
      source_url: r.source_url,
      year: r.year,
    }));
}

// ---------- Bộ chuẩn: tab "Case" và tab "Gói" ----------
// Các tab này viết cho người đọc (tiêu đề tiếng Việt, có thể có vài bảng trong một tab), nên tìm
// hàng tiêu đề theo tên cột (bỏ dấu) thay vì giả định hàng 1.

const key = (v: unknown) => slugify(String(v ?? ""));

/** Tìm hàng tiêu đề chứa đủ các cột `need` (so khớp phần đầu tên cột đã bỏ dấu). */
function findTable(rows: Row[], need: string[], from = 0): { at: number; col: (k: string) => number } | null {
  for (let i = from; i < rows.length; i++) {
    const h = (rows[i] ?? []).map(key);
    const col = (k: string) => h.findIndex((c) => c === k || c.startsWith(k + "-"));
    if (need.every((k) => col(k) >= 0)) return { at: i, col };
  }
  return null;
}

/** Các hàng dữ liệu ngay sau tiêu đề, dừng ở hàng trống đầu tiên (hoặc đọc hết nếu untilBlank=false). */
function bodyRows(rows: Row[], at: number, untilBlank: boolean): Row[] {
  const out: Row[] = [];
  for (let i = at + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const blank = !r.some((c) => String(c ?? "").trim() !== "");
    if (blank) {
      if (untilBlank) break;
      continue;
    }
    out.push(r);
  }
  return out;
}

const cell = (r: Row, i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

export function parseCases(rows: Row[]): CaseDef[] {
  const t = findTable(rows, ["ma-case"]);
  if (!t) return [];
  return bodyRows(rows, t.at, false)
    .map((r) => ({
      code: cell(r, t.col("ma-case")),
      name: cell(r, t.col("nganh-tham-chieu")),
      signals: cell(r, t.col("dieu-kien-nhan-dien")),
      group: cell(r, t.col("nhom-dich-vu")),
      goal: cell(r, t.col("muc-tieu-tu-van")),
    }))
    .filter((c) => c.code);
}

/**
 * Tab "Gói": bảng tóm tắt (Mã gói … Gửi báo giá) và bảng chi tiết (Mã gói, Case, Mức, Mã DV, …, Số lượng, Ghi chú).
 * Tổng tiền tính lại từ bảng giá đã đồng bộ (không tin số trong sheet); "Tự gửi được" lấy từ bảng tóm tắt.
 */
export function parseStandardPackages(
  rows: Row[],
  prices: PriceItem[],
): { items: StandardPackage[]; errors: string[] } {
  const errors: string[] = [];
  const detail = findTable(rows, ["ma-goi", "ma-dv"]);
  if (!detail) return { items: [], errors: rows.length ? ["Tab Gói: không thấy bảng chi tiết (cột Mã gói, Mã DV)"] : [] };

  const summary = findTable(rows, ["ma-goi", "gui-bao-gia"]);
  const autoSend = new Map<string, boolean>();
  if (summary && summary.at < detail.at) {
    for (const r of bodyRows(rows, summary.at, true)) {
      const code = cell(r, summary.col("ma-goi"));
      if (code) autoSend.set(code, key(cell(r, summary.col("gui-bao-gia"))) === "tu-gui-duoc");
    }
  }

  const priceMap = new Map(prices.map((p) => [p.code, p]));
  const byCode = new Map<string, StandardPackage>();
  bodyRows(rows, detail.at, false).forEach((r, i) => {
    const code = cell(r, detail.col("ma-goi"));
    const svc = cell(r, detail.col("ma-dv"));
    if (!code || !svc) return;
    const qty = parseVndNumber(cell(r, detail.col("so-luong")) || "1");
    const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const price = priceMap.get(svc);
    if (!price) errors.push(`Tab Gói hàng ${detail.at + i + 2}: mã ${svc} (gói ${code}) không có trong bảng giá`);
    let pkg = byCode.get(code);
    if (!pkg) {
      pkg = {
        code,
        caseCode: cell(r, detail.col("case")) || code.split("-")[0],
        tier: cell(r, detail.col("muc")),
        items: [],
        fixedTotal: 0,
        flexibleCount: 0,
        autoSend: autoSend.get(code) ?? false,
      };
      byCode.set(code, pkg);
    }
    const note = cell(r, detail.col("ghi-chu"));
    pkg.items.push({ code: svc, quantity, ...(note ? { note } : {}) });
    if (!price || price.price === 0) pkg.flexibleCount += 1;
    else pkg.fixedTotal += price.price * quantity;
  });
  return { items: [...byCode.values()], errors };
}

/** Tab "Tiêu chí": Mã | Kênh | Chỉ số | Cách lấy dữ liệu tự động | Yếu | Trung bình | Mạnh | Ghi chú. */
export function parseCriteria(rows: Row[]): Criterion[] {
  const t = findTable(rows, ["ma", "chi-so"]);
  if (!t) return [];
  return bodyRows(rows, t.at, false)
    .map((r) => ({
      code: cell(r, t.col("ma")),
      channel: cell(r, t.col("kenh")),
      label: cell(r, t.col("chi-so")),
      how: cell(r, t.col("cach-lay-du-lieu")),
      weak: cell(r, t.col("yeu")),
      mid: cell(r, t.col("trung-binh")),
      strong: cell(r, t.col("manh")),
      note: cell(r, t.col("ghi-chu")),
    }))
    .filter((c) => c.code);
}
