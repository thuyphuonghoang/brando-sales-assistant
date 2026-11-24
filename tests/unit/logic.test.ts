import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "@/lib/config";
import { budgetAdvice, buildPackages, servicesForProblem } from "@/lib/packages";
import { buildLines, computeTotals, flexibleLines, needsApproval, PricingError } from "@/lib/pricing";
import { toPresentation } from "@/lib/present";
import { parseCases, parsePrices, parseRules, parseStandardPackages, parseStats, parseVndNumber } from "@/lib/sheets-parse";
import { enforceStatsLibrary, findDisallowedNumbers, allowedNumberSet, sanitizeText, scoreFromScorecard } from "@/lib/stats-guard";
import type { Assessment, AssessmentDoc, Client, PriceItem } from "@/lib/types";
import { caseRows, packageRows, priceRows, ruleRows, statRows } from "@/server/fixtures/sheets";

const prices = parsePrices(priceRows).items;
const priceMap = new Map<string, PriceItem>(prices.map((p) => [p.code, p]));
const rules = parseRules(ruleRows);
const stats = parseStats(statRows);

describe("tên miền", () => {
  it("chỉ chấp nhận đúng tên miền, không phân biệt hoa thường", () => {
    expect(isAllowedEmail("an@brando.vn", "brando.vn")).toBe(true);
    expect(isAllowedEmail("AN@Brando.VN", "brando.vn")).toBe(true);
    expect(isAllowedEmail("an@gmail.com", "brando.vn")).toBe(false);
    expect(isAllowedEmail("an@brando.vn.evil.com", "brando.vn")).toBe(false);
    expect(isAllowedEmail("an@sub.brando.vn", "brando.vn")).toBe(false);
    expect(isAllowedEmail(null, "brando.vn")).toBe(false);
  });
});

describe("đọc Sheets", () => {
  it("giá dạng 1.500.000 được đọc thành số", () => {
    expect(parseVndNumber("1.500.000")).toBe(1_500_000);
    expect(parseVndNumber("1,500,000 ₫")).toBe(1_500_000);
    expect(priceMap.get("GBP-OPT")?.price).toBe(3_500_000);
  });
  it("service_codes tách theo dấu phẩy", () => {
    expect(rules.find((r) => r.problem_code === "LOW_VISIBILITY")?.service_codes).toEqual(["GBP-OPT", "ADS-GG"]);
  });
  it("id số liệu ổn định", () => {
    expect(parseStats(statRows)[0].id).toBe(stats[0].id);
  });
});

describe("tính tiền báo giá", () => {
  it("khớp đơn giá bảng giá, làm tròn VND", () => {
    const lines = buildLines([{ code: "GBP-OPT", quantity: 1 }, { code: "VIDEO-SHORT", quantity: 3 }], priceMap);
    expect(lines.map((l) => l.unitPrice)).toEqual([3_500_000, 2_500_000]);
    const t = computeTotals(lines, 7.5, 8);
    expect(t.subtotal).toBe(11_000_000);
    expect(t.discountAmount).toBe(825_000);
    expect(t.afterDiscount).toBe(10_175_000);
    expect(t.vatAmount).toBe(814_000);
    expect(t.total).toBe(10_989_000);
    expect(Number.isInteger(t.total)).toBe(true);
  });
  it("làm tròn khi có số lẻ", () => {
    const lines = buildLines([{ code: "GBP-OPT", quantity: 1 }], priceMap);
    const t = computeTotals(lines, 3.33, 8);
    expect(t.discountAmount).toBe(116_550);
    expect(Number.isInteger(t.vatAmount)).toBe(true);
  });
  it("mã không có trong bảng giá → lỗi", () => {
    expect(() => buildLines([{ code: "NOPE", quantity: 1 }], priceMap)).toThrow(PricingError);
  });
  it("ngưỡng duyệt chiết khấu", () => {
    expect(needsApproval(10, 10)).toBe(false);
    expect(needsApproval(10.5, 10)).toBe(true);
  });
});

const baseAssessment = (): Assessment => ({
  scorecard: [
    { item_code: "A", label: "A", result: "Đạt", evidence: "Có 15 ảnh.", weight: 3 },
    { item_code: "B", label: "B", result: "Chưa đạt", evidence: "Thiếu website.", weight: 1 },
    { item_code: "C", label: "C", result: "Không rõ", evidence: "Không rõ", weight: 5 },
  ],
  score: 0,
  competitorComparison: "Đối thủ mạnh hơn. Doanh thu đối thủ cao hơn 300% nhờ quảng cáo.",
  funnelGap: "TIN",
  funnelReason: "Thiếu bằng chứng xã hội.",
  problems: [
    { problem_code: "FEW_REVIEWS", title: "Ít đánh giá", detail: `${stats[0].stat_text}: ${stats[0].value}.`, statIds: [stats[0].id, "fake-id"] },
    { problem_code: "LOW_VISIBILITY", title: "Hồ sơ thiếu", detail: "Có tới 2.500 khách bỏ đi mỗi tháng.", statIds: [] },
    { problem_code: "WEAK_SOCIAL", title: "Social yếu", detail: "Không rõ.", statIds: [] },
  ],
  opportunities: ["Tăng 50% khách mới."],
  pitch4T: { tacDung: "Theo phương pháp 4T, bước đầu là tác dụng.", tuongXung: "x", tinTuong: "y", tangTruong: "z" },
  objections: [{ objection: "Đắt", response: "Bắt đầu nhỏ." }],
  stats: [],
});

describe("kiểm soát số liệu (STATS_SHEET)", () => {
  const allowed = allowedNumberSet(stats);
  it("phát hiện số không có trong thư viện", () => {
    expect(findDisallowedNumbers("tăng 300%", allowed)).toEqual(["300"]);
    expect(findDisallowedNumbers("87% người dùng", allowed)).toEqual([]);
    expect(findDisallowedNumbers("phương pháp 4T", allowed)).toEqual([]);
  });
  it("loại câu có số lạ, giữ câu hợp lệ", () => {
    const r = sanitizeText("Câu một ổn. Câu hai có 42 khách.", allowed);
    expect(r.text).toBe("Câu một ổn.");
    expect(r.removed).toBe(1);
  });
  it("không còn số nào ngoài thư viện trong toàn bộ nhận định", () => {
    const out = enforceStatsLibrary(baseAssessment(), stats);
    const allText = JSON.stringify({ ...out, stats: [], scorecard: out.scorecard.map((s) => s.evidence) }).replace(/"statIds":\[[^\]]*\]/g, "");
    const texts = [
      ...out.scorecard.map((s) => s.evidence),
      out.competitorComparison,
      out.funnelReason,
      ...out.problems.flatMap((p) => [p.title, p.detail]),
      ...out.opportunities,
      ...Object.values(out.pitch4T),
      ...out.objections.flatMap((o) => [o.objection, o.response]),
    ];
    for (const t of texts) expect(findDisallowedNumbers(t, allowed)).toEqual([]);
    expect(allText).not.toContain("300%");
    expect(out.problems[1].detail).toBe("Không rõ");
    expect(out.problems[0].statIds).toEqual([stats[0].id]);
    expect(out.stats).toHaveLength(1);
    expect(out.stats[0].source_url).toBe(stats[0].source_url);
    expect(out.removedSentences).toBeGreaterThanOrEqual(4);
  });
  it("điểm theo trọng số, bỏ qua Không rõ", () => {
    expect(scoreFromScorecard(baseAssessment().scorecard)).toBe(75);
  });
});

describe("gợi ý phương án", () => {
  it("ưu tiên quy tắc theo ngành rồi mới tới '*'", () => {
    expect(servicesForProblem(rules, "F&B", "WEAK_SOCIAL")[0]).toBe("VIDEO-SHORT");
    expect(servicesForProblem(rules, "Giáo dục", "WEAK_SOCIAL")[0]).toBe("FB-CONTENT");
  });
  it("tạo Cơ bản / Khuyến nghị / Toàn diện tăng dần", () => {
    const pk = buildPackages(baseAssessment().problems, "F&B", rules, priceMap);
    expect(pk.map((p) => p.tier)).toEqual(["Cơ bản", "Khuyến nghị", "Toàn diện"]);
    expect(pk[0].estimatedTotal).toBeLessThan(pk[1].estimatedTotal);
    expect(pk[1].estimatedTotal).toBeLessThan(pk[2].estimatedTotal);
  });
  it("ngân sách thấp → cảnh báo, không giảm giá", () => {
    const pk = buildPackages(baseAssessment().problems, "F&B", rules, priceMap);
    const adv = budgetAdvice(1_000_000, pk);
    expect(adv.ok).toBe(false);
    expect(adv.suggestions?.join(" ")).toContain("Chia giai đoạn");
    expect(budgetAdvice(1_000_000_000, pk).ok).toBe(true);
  });
});

describe("chế độ trình bày", () => {
  it("không chứa ghi chú nội bộ, câu nói 4T, phản đối", () => {
    const client = {
      id: "c1",
      name: "Quán Mẫu",
      industry: "F&B",
      sections: { company_info: { description: "BI-MAT-NOI-BO" }, meeting_notes: { summary: "GHI-CHU-GAP" } },
      business: { budget: 123456789, decisionMaker: "NGUOI-QUYET-DINH" },
      place: { placeId: "p", name: "Quán Mẫu", rating: 4.1, reviewCount: 12, recentReviews: [{ text: "REVIEW" }] },
      competitors: [],
    } as unknown as Client;
    const a = baseAssessment();
    a.pitch4T = { tacDung: "CAU-NOI-1", tuongXung: "CAU-NOI-2", tinTuong: "CAU-NOI-3", tangTruong: "CAU-NOI-4" };
    a.objections = [{ objection: "PHAN-DOI", response: "XU-LY" }];
    const doc: AssessmentDoc = { ai: a, edited: null, model: "m", generatedAt: 0, generatedBy: "u" };
    const json = JSON.stringify(toPresentation(client, doc));
    for (const secret of ["BI-MAT-NOI-BO", "GHI-CHU-GAP", "123456789", "NGUOI-QUYET-DINH", "CAU-NOI", "PHAN-DOI", "XU-LY", "REVIEW"]) {
      expect(json).not.toContain(secret);
    }
    expect(json).toContain("Ít đánh giá");
  });
});

describe("Bộ chuẩn: gói chuẩn và case", () => {
  it("đọc case theo tên cột tiếng Việt", () => {
    const cases = parseCases(caseRows);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ code: "M1", group: "Nhận biết" });
  });

  it("gom chi tiết theo mã gói, tính tổng từ bảng giá, lấy cờ tự gửi từ bảng tóm tắt", () => {
    const { items, errors } = parseStandardPackages(packageRows, prices);
    expect(errors).toEqual([]);
    expect(items.map((p) => p.code)).toEqual(["M1-T", "M1-C"]);
    const [t, c] = items;
    expect(t).toMatchObject({ caseCode: "M1", tier: "Tiết kiệm", fixedTotal: 7_500_000, flexibleCount: 0, autoSend: true });
    expect(c.autoSend).toBe(false);
    expect(c.items.find((i) => i.code === "FB-CONTENT")?.note).toBe("1 tháng");
  });

  it("đơn giá 0 = giá linh hoạt, mã lạ bị báo lỗi", () => {
    const withFlex = [...prices, { ...prices[0], code: "KOC-VN", price: 0 }];
    const rows = [
      ["Mã gói", "Case", "Mức", "Mã DV", "Số lượng"],
      ["X-T", "X", "Tiết kiệm", "GBP-OPT", 2],
      ["X-T", "X", "Tiết kiệm", "KOC-VN", 1],
      ["X-T", "X", "Tiết kiệm", "KHONG-CO", 1],
    ];
    const { items, errors } = parseStandardPackages(rows, withFlex);
    expect(items[0].fixedTotal).toBe(7_000_000);
    expect(items[0].flexibleCount).toBe(2);
    expect(errors).toHaveLength(1);
  });

  it("báo giá có dòng giá linh hoạt phải chờ duyệt", () => {
    const flexMap = new Map(priceMap);
    flexMap.set("KOC-VN", { ...prices[0], code: "KOC-VN", price: 0 });
    const lines = buildLines([{ code: "GBP-OPT", quantity: 1 }, { code: "KOC-VN", quantity: 1 }], flexMap);
    expect(flexibleLines(lines).map((l) => l.code)).toEqual(["KOC-VN"]);
  });
});

describe("Bộ chuẩn: bố cục tab Gói thật", () => {
  it("bỏ qua bảng mức ngân sách ở trên, đọc số dạng 1.425.000 và cột Ghi chú", () => {
    const real = parsePrices([
      ["code", "name", "group", "description", "unit", "price", "effective_from"],
      ["MAP-CARE-BASIC", "Chăm Map Gói Brando Basic", "Google Maps", "", "Gói 1 tháng", "2400000", "2026-11-24"],
      ["ENTITY-100", "Gói 100 Social Profile", "Social Entity", "", "Gói", "1200000", "2026-11-24"],
      ["FB-CARE", "Chăm sóc Fanpage & Instagram", "Facebook / Instagram", "", "Tháng", "0", "2026-11-24"],
      ["TRIP-REVIEW", "Review Tripadvisor", "Tripadvisor", "", "Review", "95000", "2026-11-24"],
    ]).items;
    const rows = [
      ["Mức ngân sách", "Trần ngân sách (VNĐ)", "Nguồn"],
      ["Tiết kiệm", "7.000.000"],
      ["Ngưỡng tự gửi báo giá (VNĐ)", "30.000.000"],
      ["Mã gói", "Case", "Mức", "Tổng phần giá cố định (VNĐ)", "Số hạng mục giá linh hoạt", "Trần mức (VNĐ)", "So với trần", "Gửi báo giá"],
      ["A4-T", "A4", "Tiết kiệm", "3.600.000", "1", "7.000.000", "Trong trần", "Chờ anh duyệt"],
      ["A9-T", "A9", "Tiết kiệm", "1.425.000", "0", "7.000.000", "Trong trần", "Tự gửi được"],
      [],
      ["Mã gói", "Case", "Mức", "Mã DV", "Dịch vụ", "Số lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)", "Ghi chú"],
      ["A4-T", "A4", "Tiết kiệm", "MAP-CARE-BASIC", "", "1", "2.400.000", "2.400.000"],
      ["A4-T", "A4", "Tiết kiệm", "ENTITY-100", "", "1", "1.200.000", "1.200.000"],
      ["A4-T", "A4", "Tiết kiệm", "FB-CARE", "", "1"],
      ["A9-T", "A9", "Tiết kiệm", "TRIP-REVIEW", "", "15", "95.000", "1.425.000", "Chia 2 tháng"],
    ];
    const { items, errors } = parseStandardPackages(rows, real);
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({ code: "A4-T", tier: "Tiết kiệm", fixedTotal: 3_600_000, flexibleCount: 1, autoSend: false });
    expect(items[1]).toMatchObject({ fixedTotal: 1_425_000, autoSend: true });
    expect(items[1].items[0]).toEqual({ code: "TRIP-REVIEW", quantity: 15, note: "Chia 2 tháng" });
  });
});
