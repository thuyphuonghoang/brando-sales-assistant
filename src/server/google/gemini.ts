import "server-only";
// Gemini: tổng hợp research → nhận định. Đầu ra luôn đi qua enforceStatsLibrary
// (loại số liệu không có trong STATS_SHEET) trước khi lưu.
import { GoogleGenAI } from "@google/genai";
import { enforceStatsLibrary, scoreFromScorecard } from "@/lib/stats-guard";
import type { Assessment, CheckResult, Client, Industry, StatItem } from "@/lib/types";
import { googleMode, requireEnv } from "./index";

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

const RESULT_VALUES: CheckResult[] = ["Đạt", "Chưa đạt", "Không rõ"];

const responseSchema = {
  type: "object",
  properties: {
    scorecard: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_code: { type: "string" },
          result: { type: "string", enum: RESULT_VALUES },
          evidence: { type: "string" },
        },
        required: ["item_code", "result", "evidence"],
      },
    },
    competitorComparison: { type: "string" },
    funnelGap: { type: "string", enum: ["BIẾT", "HIỂU", "TIN", "MUA", "Không rõ"] },
    funnelReason: { type: "string" },
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          problem_code: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          statIds: { type: "array", items: { type: "string" } },
        },
        required: ["problem_code", "title", "detail", "statIds"],
      },
    },
    opportunities: { type: "array", items: { type: "string" } },
    pitch4T: {
      type: "object",
      properties: {
        tacDung: { type: "string" },
        tuongXung: { type: "string" },
        tinTuong: { type: "string" },
        tangTruong: { type: "string" },
      },
      required: ["tacDung", "tuongXung", "tinTuong", "tangTruong"],
    },
    objections: {
      type: "array",
      items: {
        type: "object",
        properties: { objection: { type: "string" }, response: { type: "string" } },
        required: ["objection", "response"],
      },
    },
  },
  required: ["scorecard", "competitorComparison", "funnelGap", "funnelReason", "problems", "opportunities", "pitch4T", "objections"],
};

export interface AssessInput {
  client: Client;
  industry: Industry;
  stats: StatItem[]; // đã lọc theo ngành + "*"
  problemCodes: string[]; // các problem_code có trong RULES_SHEET
}

function buildPrompt({ client, industry, stats, problemCodes }: AssessInput): string {
  const data = {
    doanh_nghiep: { ten: client.name, nganh: client.industry, kenh_khai_bao: client.inputs },
    du_lieu_thu_thap_google: client.place ?? "Không rõ",
    doi_thu_thu_thap: client.competitors ?? [],
    sales_nhap: client.business,
    ghi_chu_noi_bo: client.sections,
  };
  return `Bạn là chuyên gia tư vấn marketing của BRANDO. Viết bằng tiếng Việt, ngắn gọn, thực tế.

DỮ LIỆU (JSON):
${JSON.stringify(data, null, 2)}

CHECKLIST NGÀNH "${industry.name}" (chấm từng mục: Đạt / Chưa đạt / Không rõ, kèm bằng chứng từ dữ liệu):
${JSON.stringify(industry.checklist, null, 2)}

THƯ VIỆN SỐ LIỆU (chỉ được dùng các số liệu này, tham chiếu bằng id trong statIds):
${JSON.stringify(stats.map((s) => ({ id: s.id, text: s.stat_text, value: s.value, nguon: s.source_name, nam: s.year })), null, 2)}

DANH SÁCH problem_code HỢP LỆ: ${problemCodes.join(", ")}

YÊU CẦU:
1. scorecard: đúng một dòng cho mỗi item_code trong checklist. Không có dữ liệu → "Không rõ".
2. competitorComparison: so sánh doanh nghiệp với các đối thủ đã thu thập.
3. funnelGap: giai đoạn khách hàng bị hụt nhiều nhất trong BIẾT – HIỂU – TIN – MUA; funnelReason giải thích.
4. problems: đúng 3 vấn đề ưu tiên, mỗi vấn đề một problem_code trong danh sách hợp lệ.
5. opportunities: 2–4 cơ hội.
6. pitch4T: gợi ý câu nói theo 4T: Tác dụng → Tương xứng → Tin tưởng → Tăng trưởng.
7. objections: 2–3 phản đối khách có thể nêu + cách xử lý.
QUY TẮC BẮT BUỘC:
- TUYỆT ĐỐI không viết bất kỳ con số, phần trăm, số liệu thống kê nào ngoài thư viện số liệu ở trên.
  Không nhắc lại số sao, số đánh giá, số ảnh — hệ thống tự hiển thị các số đó.
- Khi dùng số liệu từ thư viện, ghi id vào statIds của vấn đề tương ứng.
- Thiếu dữ liệu thì ghi "Không rõ", không suy đoán.`;
}

/** Chuẩn hoá đầu ra AI: đủ mục checklist, problem_code hợp lệ, tính điểm, lọc số liệu. */
export function finalizeAssessment(raw: Omit<Assessment, "score" | "stats" | "scorecard"> & { scorecard: { item_code: string; result: string; evidence: string }[] }, input: AssessInput): Assessment {
  const rows = input.industry.checklist.map((item) => {
    const r = raw.scorecard.find((x) => x.item_code === item.item_code);
    const result = (RESULT_VALUES as string[]).includes(r?.result ?? "") ? (r!.result as CheckResult) : "Không rõ";
    return { item_code: item.item_code, label: item.label, weight: item.weight, result, evidence: r?.evidence || "Không rõ" };
  });
  const valid = new Set(input.problemCodes);
  const problems = raw.problems.slice(0, 3).map((p) => ({ ...p, problem_code: valid.has(p.problem_code) ? p.problem_code : "UNKNOWN" }));
  const a: Assessment = { ...raw, scorecard: rows, problems, score: scoreFromScorecard(rows), stats: [] };
  return enforceStatsLibrary(a, input.stats);
}

export async function generateAssessment(input: AssessInput): Promise<Assessment> {
  if (googleMode() === "mock") return finalizeAssessment(mockRaw(input), input);
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const res = await ai.models.generateContent({
    model: geminiModel(),
    contents: buildPrompt(input),
    config: { responseMimeType: "application/json", responseJsonSchema: responseSchema, temperature: 0.3 },
  });
  const text = res.text;
  if (!text) throw new Error("Gemini không trả về nội dung");
  return finalizeAssessment(JSON.parse(text), input);
}

// ---------- Mock: nhận định giả lập có chủ đích chèn 1 câu có số liệu "bịa" để kiểm tra bộ lọc ----------
function mockRaw({ client, industry, stats, problemCodes }: AssessInput) {
  const p = client.place;
  const check = (code: string): CheckResult => {
    if (!p) return "Không rõ";
    if (code.includes("REVIEW")) return (p.reviewCount ?? 0) >= 50 && (p.rating ?? 0) >= 4.3 ? "Đạt" : "Chưa đạt";
    if (code.includes("PHOTO")) return (p.photoCount ?? 0) >= 10 ? "Đạt" : "Chưa đạt";
    if (code.includes("WEBSITE") || code.includes("MENU")) return p.website ? "Đạt" : "Chưa đạt";
    if (code.includes("GBP")) return p.hours && p.phone && p.website && p.description ? "Đạt" : "Chưa đạt";
    if (code.includes("SOCIAL")) return client.inputs.fanpage || client.inputs.tiktok || client.inputs.instagram ? "Đạt" : "Không rõ";
    return "Không rõ";
  };
  const firstStat = stats[0];
  const pick = (code: string, fallback: string) => (problemCodes.includes(code) ? code : fallback);
  return {
    scorecard: industry.checklist.map((c) => ({ item_code: c.item_code, result: check(c.item_code), evidence: "Dựa trên dữ liệu Google Business Profile thu thập được." })),
    competitorComparison: "Các đối thủ gần đó có hồ sơ Google đầy đủ hơn và nhiều đánh giá hơn. Doanh thu đối thủ cao hơn 300% nhờ quảng cáo.",
    funnelGap: "TIN" as const,
    funnelReason: "Khách biết đến doanh nghiệp nhưng chưa đủ bằng chứng xã hội để tin tưởng.",
    problems: [
      { problem_code: pick("FEW_REVIEWS", problemCodes[0]), title: "Ít đánh giá trên Google", detail: firstStat ? `${firstStat.stat_text}: ${firstStat.value}.` : "Không rõ", statIds: firstStat ? [firstStat.id] : [] },
      { problem_code: pick("LOW_VISIBILITY", problemCodes[1] ?? problemCodes[0]), title: "Hồ sơ Google chưa đầy đủ", detail: "Thiếu mô tả và website khiến khách khó ra quyết định.", statIds: [] },
      { problem_code: pick("WEAK_SOCIAL", problemCodes[2] ?? problemCodes[0]), title: "Mạng xã hội chưa hoạt động đều", detail: "Không rõ tần suất đăng bài.", statIds: [] },
    ],
    opportunities: ["Khai thác lượng khách tìm kiếm trên Google Maps khu vực lân cận.", "Xây dựng quy trình xin đánh giá sau mỗi lần phục vụ."],
    pitch4T: {
      tacDung: "Hồ sơ Google đầy đủ giúp khách tìm thấy và chọn anh/chị nhanh hơn.",
      tuongXung: "Chi phí tối ưu hồ sơ thấp hơn nhiều so với chi phí quảng cáo để có cùng lượng khách.",
      tinTuong: "BRANDO đã triển khai cho nhiều doanh nghiệp cùng ngành.",
      tangTruong: "Khi đánh giá tăng đều, doanh nghiệp có nền tảng để mở rộng quảng cáo hiệu quả.",
    },
    objections: [
      { objection: "Khách quen đã đủ, không cần marketing.", response: "Khách quen là nền tảng; hồ sơ tốt giúp giữ chân họ và thu hút khách mới cùng lúc." },
      { objection: "Chi phí cao.", response: "Có thể bắt đầu với phương án Cơ bản và mở rộng theo kết quả." },
    ],
  };
}
