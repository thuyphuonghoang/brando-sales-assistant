// Gợi ý dịch vụ theo RULES_SHEET (industry + problem_code → service_codes[])
// và dựng 3 phương án Cơ bản / Khuyến nghị / Toàn diện.
import type { Assessment, PackageOption, PriceItem, RuleRow } from "./types";

export function servicesForProblem(rules: RuleRow[], industry: string, problemCode: string): string[] {
  const exact = rules.filter((r) => r.problem_code === problemCode && r.industry === industry);
  const generic = rules.filter((r) => r.problem_code === problemCode && r.industry === "*");
  const codes = (exact.length ? exact : generic).flatMap((r) => r.service_codes);
  return [...new Set(codes)];
}

function estimate(items: { code: string; quantity: number }[], prices: Map<string, PriceItem>): number {
  return items.reduce((s, i) => s + (prices.get(i.code)?.price ?? 0) * i.quantity, 0);
}

/**
 * - Cơ bản: dịch vụ đầu tiên của vấn đề ưu tiên số 1.
 * - Khuyến nghị: dịch vụ đầu tiên của cả 3 vấn đề.
 * - Toàn diện: tất cả dịch vụ được gợi ý cho 3 vấn đề.
 * Phương án trùng nội dung với phương án trước sẽ bị bỏ (nên có thể chỉ còn 2).
 */
export function buildPackages(
  problems: Assessment["problems"],
  industry: string,
  rules: RuleRow[],
  prices: Map<string, PriceItem>,
): PackageOption[] {
  const perProblem = problems.map((p) => ({
    title: p.title,
    codes: servicesForProblem(rules, industry, p.problem_code).filter((c) => prices.has(c)),
  }));
  const withServices = perProblem.filter((p) => p.codes.length > 0);
  if (withServices.length === 0) return [];

  const mk = (tier: PackageOption["tier"], parts: { title: string; codes: string[] }[]): PackageOption => {
    const codes = [...new Set(parts.flatMap((p) => p.codes))];
    const items = codes.map((code) => ({ code, quantity: 1 }));
    return { tier, items, solves: parts.map((p) => p.title), estimatedTotal: estimate(items, prices) };
  };

  const basic = mk("Cơ bản", [{ title: withServices[0].title, codes: [withServices[0].codes[0]] }]);
  const recommended = mk(
    "Khuyến nghị",
    withServices.map((p) => ({ title: p.title, codes: [p.codes[0]] })),
  );
  const full = mk("Toàn diện", withServices);

  const out: PackageOption[] = [basic];
  for (const p of [recommended, full]) {
    const prev = out[out.length - 1];
    const same = prev.items.map((i) => i.code).join() === p.items.map((i) => i.code).join();
    if (!same) out.push(p);
  }
  return out;
}

export interface BudgetAdvice {
  ok: boolean;
  message?: string;
  suggestions?: string[];
}

/** Ngân sách thấp hơn phương án tối thiểu → cảnh báo, gợi ý thu hẹp/chia giai đoạn. KHÔNG giảm giá. */
export function budgetAdvice(budget: number | null | undefined, packages: PackageOption[]): BudgetAdvice {
  if (!budget || packages.length === 0) return { ok: true };
  const min = Math.min(...packages.map((p) => p.estimatedTotal));
  if (budget >= min) return { ok: true };
  return {
    ok: false,
    message: "Ngân sách của khách thấp hơn phương án tối thiểu.",
    suggestions: [
      "Thu hẹp phạm vi: chỉ giữ dịch vụ giải quyết vấn đề ưu tiên số 1.",
      "Chia giai đoạn: triển khai phương án Cơ bản trước, bổ sung hạng mục ở giai đoạn sau.",
      "Không tự giảm giá — nếu cần chiết khấu, tạo báo giá để trưởng nhóm duyệt.",
    ],
  };
}
