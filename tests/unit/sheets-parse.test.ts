import { describe, expect, it } from "vitest";

describe("ngành mặc định khi chưa có sheet ngành", () => {
  it("6 ngành theo case, checklist lấy từ tab Tiêu chí", async () => {
    const { defaultIndustries, parseCriteria } = await import("@/lib/sheets-parse");
    const criteria = parseCriteria([
      ["Mã", "Kênh", "Chỉ số", "Cách lấy dữ liệu tự động", "Yếu", "Trung bình", "Mạnh", "Ghi chú"],
      ["MAP-REV", "Google Maps", "Số review", "Places", "< 100", "100 - 500", "> 1.000", ""],
      ["AREA", "Khu vực", "Khu vực kinh doanh", "Map", "", "", "", "Phân loại: khu phố Tây"],
    ]);
    const list = defaultIndustries(criteria);
    expect(list.map((i) => i.name)).toContain("Spa, làm đẹp");
    expect(list.at(-1)!.name).toBe("Khác");
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    expect(list[0].checklist).toEqual([
      { item_code: "MAP-REV", label: "Google Maps: Số review", how_to_check: "Yếu: < 100 · Trung bình: 100 - 500 · Mạnh: > 1.000", weight: 1 },
      { item_code: "AREA", label: "Khu vực: Khu vực kinh doanh", how_to_check: "Phân loại: khu phố Tây", weight: 1 },
    ]);
  });
});

describe("quy tắc mặc định khi chưa có sheet quy tắc", () => {
  it("mỗi tiêu chí có dịch vụ thành một problem_code, chỉ giữ mã có trong bảng giá", async () => {
    const { defaultRules, parseCriteria } = await import("@/lib/sheets-parse");
    const criteria = parseCriteria([
      ["Mã", "Kênh", "Chỉ số", "Cách lấy dữ liệu tự động", "Yếu", "Trung bình", "Mạnh", "Ghi chú"],
      ["MAP-REV", "Google Maps", "Số review", "", "< 100", "", "> 1.000", ""],
      ["AREA", "Khu vực", "Khu vực", "", "", "", "", ""],
      ["WEB-SSL", "Website", "HTTPS", "", "Chưa có", "", "Có", ""],
    ]);
    const rules = defaultRules(criteria, new Set(["MAP-CARE-PRO", "MAP-LG6"]));
    expect(rules).toEqual([{ industry: "*", problem_code: "MAP-REV", service_codes: ["MAP-CARE-PRO", "MAP-LG6"] }]);
  });
});
