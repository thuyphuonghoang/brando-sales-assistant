// Chấm điểm theo Bộ chuẩn (tab Tiêu chí) và gợi ý case (tab Case). Thuần logic, dùng chung server + client.
// Ngưỡng đọc thẳng từ chữ trong sheet ("< 100", "100 - 500", "Top 10"), sửa sheet là đổi cách chấm.
// Tiêu chí không đo tự động được thì dùng giá trị sales nhập; thiếu cả hai → "Không rõ", không đoán.
import { slugify } from "./sheets-parse";
import type { CaseDef, CaseMatch, CaseSuggestion, Client, Criterion, CriterionLevel, CriterionResult } from "./types";

const LEVELS: CriterionLevel[] = ["Yếu", "Trung bình", "Mạnh"];

// ---------- Ngưỡng dạng số ----------
export interface Range {
  min: number; // bao gồm
  max: number; // bao gồm
}

/** "1.000" → 1000, "4.0" → 4, "3,5" → 3.5 */
export function parseNum(s: string): number {
  const t = s.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t.replace(",", "."));
}

const NUM = String.raw`(\d+(?:[.,]\d+)*)`;

/** Đọc các khoảng số trong một ô ngưỡng; nhiều khoảng phân cách bằng ";". Ô chỉ có chữ → []. */
export function parseRanges(cellText: string): Range[] {
  const out: Range[] = [];
  for (const raw of cellText.split(";")) {
    const seg = raw.trim().toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = seg.match(new RegExp(`^(?:top\\s*)?${NUM}\\s*-\\s*${NUM}`)))) out.push({ min: parseNum(m[1]), max: parseNum(m[2]) });
    else if ((m = seg.match(new RegExp(`^<\\s*${NUM}`)))) out.push({ min: -Infinity, max: parseNum(m[1]) - 1e-9 });
    else if ((m = seg.match(new RegExp(`^>\\s*${NUM}`)))) out.push({ min: parseNum(m[1]) + 1e-9, max: Infinity });
    else if ((m = seg.match(new RegExp(`^top\\s*${NUM}$`)))) out.push({ min: 0, max: parseNum(m[1]) });
  }
  return out.filter((r) => Number.isFinite(r.min) || Number.isFinite(r.max));
}

const inRanges = (v: number, rs: Range[]) => rs.some((r) => v >= r.min && v <= r.max);

/**
 * Tiêu chí có ngưỡng số: ít nhất 2 ô Yếu/Trung bình/Mạnh đọc được khoảng số. Chỉ 1 ô có số (vd. MAP-POST
 * "< 1 bài/tháng" nhưng các mức khác là chữ) thì coi là tiêu chí chọn mức, tránh nhập lẫn đơn vị.
 */
export function isNumeric(c: Criterion): boolean {
  return [c.weak, c.mid, c.strong].filter((x) => parseRanges(x).length > 0).length >= 2;
}

/** Xếp mức cho một giá trị số. Không thuộc khoảng nào → null (sheet chưa có mức, vd. TRIP-REV 51–100). */
export function levelForNumber(c: Criterion, v: number): CriterionLevel | null {
  if (inRanges(v, parseRanges(c.strong))) return "Mạnh";
  if (inRanges(v, parseRanges(c.weak))) return "Yếu";
  if (inRanges(v, parseRanges(c.mid))) return "Trung bình";
  return null;
}

/** Các mức sales chọn được cho tiêu chí dạng chữ: chỉ những mức sheet có mô tả. */
export function levelOptions(c: Criterion): { level: CriterionLevel; text: string }[] {
  return LEVELS.map((level, i) => ({ level, text: [c.weak, c.mid, c.strong][i] })).filter((o) => o.text);
}

/** Tiêu chí phân loại (vd. AREA): ghi chú dạng "Phân loại: a, b, c". */
export function categoryOptions(c: Criterion): string[] {
  const m = c.note.match(/phân loại\s*:\s*(.+)$/i);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ---------- Đo tự động từ dữ liệu Google Maps đã thu thập ----------
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

/** Tên Map vi phạm: viết hoa toàn bộ hoặc nhồi từ khóa (nhiều dấu ngăn cách). */
export function nameViolates(name: string): boolean {
  const letters = name.replace(/[^\p{L}]/gu, "");
  const allCaps = letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const separators = (name.match(/[|,\-–]/g) ?? []).length;
  return allCaps || separators >= 3;
}

function autoValue(c: Criterion, client: Client): { level?: CriterionLevel; num?: number; value?: string; evidence: string } | null {
  const p = client.place;
  if (!p) return null;
  switch (c.code) {
    case "MAP-REV":
      return p.reviewCount != null ? { num: p.reviewCount, value: `${p.reviewCount} review`, evidence: "Google Places API" } : null;
    case "MAP-BOOK": {
      const has = !!p.actionButtons?.includes("Đặt chỗ");
      return { level: has ? "Mạnh" : "Yếu", value: has ? "Có" : "Chưa có", evidence: "Nút hành động trên hồ sơ Google" };
    }
    case "MAP-NAME": {
      const bad = nameViolates(p.name);
      return { level: bad ? "Yếu" : "Mạnh", value: p.name, evidence: bad ? "Tên viết hoa toàn bộ hoặc nhồi từ khóa" : "Không thấy dấu hiệu vi phạm" };
    }
    case "MAP-LANG": {
      const texts = (p.recentReviews ?? []).map((r) => r.text).filter((t) => t.trim());
      if (texts.length === 0) return null;
      const foreign = texts.filter((t) => /[a-z]/i.test(t) && !VI_CHARS.test(t)).length;
      return {
        value: foreign ? `${foreign}/${texts.length} review gần đây không phải tiếng Việt` : "Review gần đây đều tiếng Việt",
        evidence: "Mẫu review gần đây từ Google Places (chưa phải toàn bộ review)",
      };
    }
    default:
      return null;
  }
}

/** Chấm toàn bộ tiêu chí cho một khách. Giá trị sales nhập ưu tiên hơn số đo tự động. */
export function evaluateCriteria(criteria: Criterion[], client: Client): CriterionResult[] {
  const manual = client.business?.criteria ?? {};
  return criteria.map((c) => {
    const base = { code: c.code, channel: c.channel, label: c.label };
    const typed = (manual[c.code] ?? "").trim();
    const numeric = isNumeric(c);

    if (typed) {
      if ((LEVELS as string[]).includes(typed)) return { ...base, level: typed as CriterionLevel, value: typed, evidence: "Sales đánh giá", source: "Sales nhập" };
      if (numeric && Number.isFinite(parseNum(typed))) {
        const level = levelForNumber(c, parseNum(typed));
        return {
          ...base,
          level: level ?? "Không rõ",
          value: typed,
          evidence: level ? "Sales nhập số liệu" : `Giá trị ${typed} chưa thuộc mức nào trong Bộ chuẩn`,
          source: "Sales nhập",
        };
      }
      return { ...base, level: "Không rõ", value: typed, evidence: "Sales nhập", source: "Sales nhập" };
    }

    const auto = autoValue(c, client);
    if (auto) {
      let level = auto.level ?? "Không rõ";
      let evidence = auto.evidence;
      if (auto.num != null && numeric) {
        const l = levelForNumber(c, auto.num);
        if (l) level = l;
        else evidence += ` — giá trị chưa thuộc mức nào trong Bộ chuẩn`;
      }
      return { ...base, level, value: auto.value, evidence, source: "Thu thập" };
    }
    return { ...base, level: "Không rõ", evidence: c.how ? `Chưa có dữ liệu (cần: ${c.how})` : "Chưa có dữ liệu", source: "Chưa có dữ liệu" };
  });
}

// ---------- Nhận diện case ----------
export type Condition =
  | { kind: "num"; raw: string; code: string; ranges: Range[] }
  | { kind: "rating"; raw: string; ranges: Range[] }
  | { kind: "text"; raw: string; code: string; expected: string }
  | { kind: "manual"; raw: string };

const CODE = String.raw`([A-Z]{2,}(?:-[A-Z]+)*)`;

/** Đọc cột "Điều kiện nhận diện" của tab Case. Phần không đọc được giữ lại để sales tự kiểm. */
export function parseConditions(text: string, cases: CaseDef[], depth = 0): Condition[] {
  const out: Condition[] = [];
  for (const raw0 of text.split(";")) {
    const raw = raw0.trim();
    if (!raw) continue;
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^như\s+([A-Z]\d+)\s*[,+]?\s*(.*)$/i)) && depth < 3) {
      const ref = cases.find((c) => c.code.toUpperCase() === m![1].toUpperCase());
      if (ref) out.push(...parseConditions(ref.signals, cases, depth + 1));
      if (m[2].trim()) out.push({ kind: "manual", raw: m[2].trim() });
      continue;
    }
    if ((m = raw.match(/^điểm sao\s+(khoảng\s+)?(.+)$/i))) {
      const ranges = m[1] ? [{ min: parseNum(m[2]) - 0.3, max: parseNum(m[2]) + 0.3 }] : parseRanges(m[2]);
      if (ranges.length && ranges.every((r) => !Number.isNaN(r.min) && !Number.isNaN(r.max))) {
        out.push({ kind: "rating", raw, ranges });
        continue;
      }
    }
    if ((m = raw.match(new RegExp(`^${CODE}\\s*=\\s*(.+)$`)))) {
      out.push({ kind: "text", raw, code: m[1], expected: m[2].trim() });
      continue;
    }
    if ((m = raw.match(new RegExp(`^${CODE}\\s+(.+)$`)))) {
      const ranges = parseRanges(m[2]);
      out.push(ranges.length ? { kind: "num", raw, code: m[1], ranges } : { kind: "text", raw, code: m[1], expected: m[2].trim() });
      continue;
    }
    out.push({ kind: "manual", raw });
  }
  return out;
}

const NEGATIVE = /(chua|khong|rai-rac|bo-trong|moi-tao|thua|it-)/;

function numericFact(code: string, client: Client): number | null {
  const typed = client.business?.criteria?.[code];
  if (typed && Number.isFinite(parseNum(typed))) return parseNum(typed);
  if (code === "MAP-REV" && client.place?.reviewCount != null) return client.place.reviewCount;
  return null;
}

/** true = khớp, false = không khớp, null = chưa đủ dữ liệu để kiểm. */
export function checkCondition(cond: Condition, client: Client, results: Map<string, CriterionResult>): boolean | null {
  switch (cond.kind) {
    case "manual":
      return null;
    case "rating": {
      const r = client.place?.rating;
      return r == null ? null : inRanges(r, cond.ranges);
    }
    case "num": {
      const v = numericFact(cond.code, client);
      return v == null ? null : inRanges(v, cond.ranges);
    }
    case "text": {
      const res = results.get(cond.code);
      const typed = client.business?.criteria?.[cond.code];
      // Tiêu chí phân loại (AREA…): so khớp chữ sales chọn.
      if (typed && !(LEVELS as string[]).includes(typed) && !Number.isFinite(parseNum(typed))) {
        const a = slugify(typed);
        const b = slugify(cond.expected);
        return a.includes(b) || b.includes(a);
      }
      if (!res || res.level === "Không rõ") return null;
      return NEGATIVE.test(slugify(cond.expected)) ? res.level !== "Mạnh" : res.level === "Mạnh";
    }
  }
}

const STOP = new Set(["nganh", "canh", "tranh", "khu", "pho", "thanh", "va", "cac", "dich", "vu", "o", "trung", "binh", "local"]);
const tokens = (s: string) => new Set(slugify(s).split("-").filter((t) => t.length >= 3 && !STOP.has(t)));

/** Ngành khách có trùng từ khóa với "Ngành tham chiếu" của case không — chỉ dùng để phá hoà. */
export function industryHint(c: CaseDef, industry: string): boolean {
  const a = tokens(c.name);
  return [...tokens(industry)].some((t) => a.has(t));
}

export const AUTO_PICK_MIN_RATIO = 0.75;
export const AUTO_PICK_MIN_CHECKED = 2;

/**
 * Gợi ý case theo tín hiệu (không theo ngành). Chỉ tự chọn khi case dẫn đầu khớp ≥ 75% điều kiện kiểm được,
 * kiểm được ít nhất 2 điều kiện và không hoà; ngược lại để sales/trưởng nhóm chọn.
 */
export function suggestCase(cases: CaseDef[], results: CriterionResult[], client: Client): CaseSuggestion {
  const byCode = new Map(results.map((r) => [r.code, r]));
  const candidates: (CaseMatch & { hint: boolean })[] = cases.map((c) => {
    const matched: string[] = [];
    const failed: string[] = [];
    const unchecked: string[] = [];
    for (const cond of parseConditions(c.signals, cases)) {
      const ok = checkCondition(cond, client, byCode);
      (ok === null ? unchecked : ok ? matched : failed).push(cond.raw);
    }
    const checked = matched.length + failed.length;
    return { code: c.code, name: c.name, matched, failed, unchecked, ratio: checked ? matched.length / checked : 0, hint: industryHint(c, client.industry) };
  });
  candidates.sort((a, b) => b.ratio - a.ratio || b.matched.length - a.matched.length || Number(b.hint) - Number(a.hint));

  const strip = (c: CaseMatch & { hint: boolean }): CaseMatch => ({ code: c.code, name: c.name, matched: c.matched, failed: c.failed, unchecked: c.unchecked, ratio: c.ratio });
  const top = candidates[0];
  if (!top) return { pick: null, needsReview: true, reason: "Bộ chuẩn chưa có case nào.", candidates: [] };
  const checked = top.matched.length + top.failed.length;
  const ties = candidates.filter((c) => c.ratio === top.ratio && c.matched.length === top.matched.length && c.hint === top.hint);

  let reason: string;
  let pick: string | null = null;
  if (checked < AUTO_PICK_MIN_CHECKED) reason = "Chưa đủ dữ liệu để nhận diện case — cần bổ sung tiêu chí.";
  else if (top.ratio < AUTO_PICK_MIN_RATIO) reason = `Không case nào khớp đủ ${Math.round(AUTO_PICK_MIN_RATIO * 100)}% điều kiện.`;
  else if (ties.length > 1) reason = `Hoà giữa ${ties.map((t) => t.code).join(", ")} — cần người chọn.`;
  else {
    pick = top.code;
    reason = `Khớp ${top.matched.length}/${checked} điều kiện kiểm được của ${top.code}.`;
  }
  return { pick, needsReview: pick === null, reason, candidates: candidates.map(strip) };
}
