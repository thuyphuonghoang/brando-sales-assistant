// Kiểm soát số liệu trong nhận định AI: chỉ những con số có trong thư viện STATS_SHEET
// (được truyền vào prompt) mới được phép xuất hiện. Câu nào chứa số lạ sẽ bị loại bỏ.
import type { Assessment, StatItem, StatRef } from "./types";

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

/** Chuẩn hoá một token số thành chuỗi chữ số ("1.200" → "1200", "4,5" → "45"). */
function digits(token: string): string {
  return token.replace(/\D/g, "");
}

export function allowedNumberSet(stats: StatItem[]): Set<string> {
  const set = new Set<string>();
  for (const s of stats) {
    for (const src of [s.value, s.stat_text]) {
      for (const m of String(src ?? "").matchAll(NUMBER_RE)) set.add(digits(m[0]));
    }
  }
  return set;
}

/** Số trong cụm cố định của phương pháp (vd. "4T") không tính là số liệu. */
function isMethodToken(text: string, index: number, token: string): boolean {
  const after = text.slice(index + token.length, index + token.length + 1);
  return token === "4" && after === "T";
}

export function findDisallowedNumbers(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    if (isMethodToken(text, m.index ?? 0, m[0])) continue;
    if (!allowed.has(digits(m[0]))) bad.push(m[0]);
  }
  return bad;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).filter((s) => s.trim() !== "");
}

/** Loại các câu chứa số không có trong thư viện. Trả về text đã lọc và số câu bị loại. */
export function sanitizeText(text: string, allowed: Set<string>): { text: string; removed: number } {
  if (!text) return { text: "Không rõ", removed: 0 };
  let removed = 0;
  const kept = splitSentences(text).filter((s) => {
    const ok = findDisallowedNumbers(s, allowed).length === 0;
    if (!ok) removed++;
    return ok;
  });
  const out = kept.join(" ").trim();
  return { text: out || "Không rõ", removed };
}

/**
 * Áp dụng kiểm soát số liệu cho toàn bộ nhận định:
 * - mọi chuỗi văn bản do AI viết đi qua sanitizeText;
 * - statIds không có trong thư viện bị bỏ;
 * - danh sách `stats` (kèm nguồn) được dựng lại từ thư viện, không lấy từ AI.
 */
export function enforceStatsLibrary(a: Assessment, library: StatItem[]): Assessment {
  const allowed = allowedNumberSet(library);
  const byId = new Map(library.map((s) => [s.id, s]));
  let removed = 0;
  const clean = (t: string) => {
    const r = sanitizeText(t ?? "", allowed);
    removed += r.removed;
    return r.text;
  };

  const usedIds = new Set<string>();
  const problems = a.problems.map((p) => {
    const statIds = (p.statIds ?? []).filter((id) => byId.has(id));
    statIds.forEach((id) => usedIds.add(id));
    return { ...p, title: clean(p.title), detail: clean(p.detail), statIds };
  });
  for (const s of a.stats ?? []) if (byId.has(s.statId)) usedIds.add(s.statId);

  const stats: StatRef[] = [...usedIds].map((id) => {
    const s = byId.get(id)!;
    return { statId: s.id, text: s.stat_text, source_name: s.source_name, source_url: s.source_url, year: s.year };
  });

  return {
    ...a,
    scorecard: a.scorecard.map((r) => ({ ...r, evidence: clean(r.evidence) })),
    competitorComparison: clean(a.competitorComparison),
    funnelReason: clean(a.funnelReason),
    problems,
    opportunities: a.opportunities.map(clean),
    pitch4T: {
      tacDung: clean(a.pitch4T.tacDung),
      tuongXung: clean(a.pitch4T.tuongXung),
      tinTuong: clean(a.pitch4T.tinTuong),
      tangTruong: clean(a.pitch4T.tangTruong),
    },
    objections: a.objections.map((o) => ({ objection: clean(o.objection), response: clean(o.response) })),
    stats,
    removedSentences: removed,
  };
}

/** Điểm hiện diện 0..100 theo trọng số; mục "Không rõ" không tính vào mẫu số. */
export function scoreFromScorecard(rows: Assessment["scorecard"]): number {
  const known = rows.filter((r) => r.result !== "Không rõ");
  const total = known.reduce((s, r) => s + (r.weight || 0), 0);
  if (total === 0) return 0;
  const got = known.filter((r) => r.result === "Đạt").reduce((s, r) => s + (r.weight || 0), 0);
  return Math.round((got / total) * 100);
}
