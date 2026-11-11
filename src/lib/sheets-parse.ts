// Chuyển dữ liệu thô từ Google Sheets (mảng các hàng) thành object catalog.
// Hàng đầu tiên là tiêu đề cột; tên cột không phân biệt hoa thường/khoảng trắng.
import type { ChecklistItem, Industry, PriceItem, RuleRow, StatItem } from "./types";

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
