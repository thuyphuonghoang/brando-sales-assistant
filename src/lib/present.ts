// Dữ liệu cho chế độ trình bày (/present). Dùng whitelist: chỉ chép các field được phép,
// KHÔNG bao giờ spread object gốc — để ghi chú nội bộ, gợi ý câu nói, phản đối, bình luận
// không thể lọt ra HTML.
import type { AssessmentDoc, Client } from "./types";

export interface PresentationData {
  clientName: string;
  industry: string;
  score: number | null;
  scorecard: { label: string; result: string }[];
  place: { rating?: number; reviewCount?: number; photoCount?: number; category?: string } | null;
  competitors: { name: string; rating?: number; reviewCount?: number; photoCount?: number }[];
  competitorComparison: string;
  problems: { title: string; detail: string }[];
  opportunities: string[];
  stats: { text: string; source_name: string; source_url: string; year: number | string }[];
}

export function toPresentation(client: Client, assessment: AssessmentDoc | null): PresentationData {
  const a = assessment ? (assessment.edited ?? assessment.ai) : null;
  return {
    clientName: client.name,
    industry: client.industry,
    score: a ? a.score : null,
    scorecard: a ? a.scorecard.map((r) => ({ label: r.label, result: r.result })) : [],
    place: client.place
      ? {
          rating: client.place.rating,
          reviewCount: client.place.reviewCount,
          photoCount: client.place.photoCount,
          category: client.place.category,
        }
      : null,
    competitors: (client.competitors ?? []).map((c) => ({
      name: c.name,
      rating: c.rating,
      reviewCount: c.reviewCount,
      photoCount: c.photoCount,
    })),
    competitorComparison: a?.competitorComparison ?? "Không rõ",
    problems: a ? a.problems.map((p) => ({ title: p.title, detail: p.detail })) : [],
    opportunities: a ? [...a.opportunities] : [],
    stats: a
      ? a.stats.map((s) => ({ text: s.text, source_name: s.source_name, source_url: s.source_url, year: s.year }))
      : [],
  };
}
