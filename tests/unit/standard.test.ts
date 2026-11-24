import { describe, expect, it } from "vitest";
import { parseCases, parseCriteria } from "@/lib/sheets-parse";
import { evaluateCriteria, isNumeric, levelForNumber, nameViolates, parseConditions, parseRanges, suggestCase } from "@/lib/standard";
import type { Client, PlaceInfo } from "@/lib/types";

// Trích nguyên văn từ tab Tiêu chí và Case của Bộ chuẩn (ngày 24/11/2026).
const criteria = parseCriteria([
  ["Mã", "Kênh", "Chỉ số", "Cách lấy dữ liệu tự động", "Yếu", "Trung bình", "Mạnh", "Ghi chú", "Nguồn"],
  ["MAP-REV", "Google Maps", "Số review", "Google Places API", "< 100", "100 - 500 (trung bình); 500 - 1.000 (trung bình cao)", "> 1.000", "", ""],
  ["MAP-POST", "Google Maps", "Bài viết chủ sở hữu", "SerpApi", "< 1 bài/tháng", "Khoảng 1 bài/3 tuần (ổn)", "Đăng hàng ngày", "", ""],
  ["MAP-NAME", "Google Maps", "Tên Map vi phạm chính sách", "Places API", "Viết hoa toàn bộ hoặc nhồi từ khóa", "", "Không vi phạm", "", ""],
  ["MAP-BOOK", "Google Maps", "Nút đặt bàn / đặt lịch / đặt phòng", "Places API", "Chưa có", "", "Có", "", ""],
  ["TRIP-VERIFIED", "Tripadvisor", "Hồ sơ đã xác minh", "Tripadvisor Content API", "Chưa tạo / chưa xác minh", "", "Đã xác minh", "", ""],
  ["TRIP-RANK", "Tripadvisor", "Thứ hạng trong khu vực", "Tripadvisor Content API", "> 50", "Top 10 - 50", "Top 10", "", ""],
  ["TRIP-REV", "Tripadvisor", "Số review", "Tripadvisor Content API", "< 30", "30 - 50 (ổn)", "> 100", "Khoảng 51 - 100 chưa được xếp mức", ""],
  ["FB-FREQ", "Facebook", "Tần suất đăng bài", "Theo dõi Fanpage", "< 3 bài/tuần", "3 - 5 bài/tuần (ổn)", "", "", ""],
  ["AREA", "Khu vực", "Khu vực kinh doanh", "Địa chỉ trên Map", "", "", "", "Phân loại: khu phố Tây, thành phố du lịch, khu dân cư local", ""],
]);
const crit = (code: string) => criteria.find((c) => c.code === code)!;

const cases = parseCases([
  ["Mã case", "Ngành tham chiếu", "Điều kiện nhận diện (theo tab Tiêu chí)", "Nhóm dịch vụ", "Mục tiêu tư vấn"],
  ["A1", "Ngành cạnh tranh ở khu phố Tây (nhà hàng, bar, cafe...)", "AREA = khu phố Tây; MAP-REV < 100; MAP-POST = không đăng; điểm sao khoảng 4.0; TRIP-VERIFIED = chưa tạo", "Nhận biết", ""],
  ["A2", "Nhà hàng ở thành phố du lịch", "AREA = thành phố du lịch; MAP-REV 100 - 500; MAP-POST rải rác; điểm sao 3.7 - 4.5; TRIP-VERIFIED = chưa tạo", "Chuyển đổi", ""],
  ["A3", "Spa ở thành phố du lịch", "Như A2, ngành dịch vụ làm đẹp / chăm sóc", "Chuyển đổi", ""],
  ["A4", "Cafe, quán ăn local (cạnh tranh trung bình)", "MAP-REV 50 - 100; điểm sao 3.7 - 4.5; MAP-POST = chưa đăng; Fanpage bỏ trống hoặc mới tạo", "Chuyển đổi", ""],
]);

function client(over: { industry?: string; place?: Partial<PlaceInfo>; criteria?: Record<string, string> }): Client {
  return {
    id: "c1",
    name: "Khách",
    industry: over.industry ?? "F&B",
    inputs: {},
    ownerId: "u",
    ownerName: "U",
    collaboratorIds: [],
    teamId: "t",
    status: "research",
    sections: { company_info: {}, online_presence: {}, competitors: {}, industry_notes: {}, meeting_notes: {} },
    business: { criteria: over.criteria ?? {} },
    place: over.place ? ({ placeId: "p", name: "Quán Ngon", actionButtons: [], ...over.place } as PlaceInfo) : null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("ngưỡng trong tab Tiêu chí", () => {
  it("đọc khoảng số, kể cả 1.000 và Top N", () => {
    expect(parseRanges("100 - 500 (trung bình); 500 - 1.000 (trung bình cao)")).toEqual([
      { min: 100, max: 500 },
      { min: 500, max: 1000 },
    ]);
    expect(parseRanges("Top 10")).toEqual([{ min: 0, max: 10 }]);
    expect(parseRanges("Chưa có")).toEqual([]);
  });

  it("xếp mức MAP-REV, TRIP-RANK; khoảng trống trong sheet → không đoán", () => {
    expect(levelForNumber(crit("MAP-REV"), 60)).toBe("Yếu");
    expect(levelForNumber(crit("MAP-REV"), 300)).toBe("Trung bình");
    expect(levelForNumber(crit("MAP-REV"), 800)).toBe("Trung bình");
    expect(levelForNumber(crit("MAP-REV"), 1500)).toBe("Mạnh");
    expect(levelForNumber(crit("TRIP-RANK"), 5)).toBe("Mạnh");
    expect(levelForNumber(crit("TRIP-RANK"), 30)).toBe("Trung bình");
    expect(levelForNumber(crit("TRIP-RANK"), 80)).toBe("Yếu");
    expect(levelForNumber(crit("TRIP-REV"), 75)).toBeNull();
  });

  it("chỉ coi là tiêu chí số khi có từ 2 mức số trở lên", () => {
    expect(isNumeric(crit("FB-FREQ"))).toBe(true);
    expect(isNumeric(crit("MAP-POST"))).toBe(false);
    expect(isNumeric(crit("MAP-BOOK"))).toBe(false);
  });

  it("tên Map viết hoa toàn bộ hoặc nhồi từ khóa là vi phạm", () => {
    expect(nameViolates("NHÀ HÀNG BIỂN XANH")).toBe(true);
    expect(nameViolates("Phở Hà Nội - Bún Chả - Nem - Cơm")).toBe(true);
    expect(nameViolates("Nhà hàng Biển Xanh")).toBe(false);
  });
});

describe("chấm tiêu chí cho một khách", () => {
  it("tự đo từ Google, sales nhập ưu tiên hơn, thiếu dữ liệu ghi Không rõ", () => {
    const c = client({ place: { reviewCount: 320, actionButtons: ["Gọi", "Đặt chỗ"] }, criteria: { "TRIP-REV": "75", "MAP-POST": "Yếu" } });
    const r = new Map(evaluateCriteria(criteria, c).map((x) => [x.code, x]));
    expect(r.get("MAP-REV")).toMatchObject({ level: "Trung bình", source: "Thu thập" });
    expect(r.get("MAP-BOOK")).toMatchObject({ level: "Mạnh", source: "Thu thập" });
    expect(r.get("MAP-POST")).toMatchObject({ level: "Yếu", source: "Sales nhập" });
    expect(r.get("TRIP-REV")).toMatchObject({ level: "Không rõ", source: "Sales nhập" });
    expect(r.get("TRIP-REV")!.evidence).toContain("chưa thuộc mức nào");
    expect(r.get("FB-FREQ")).toMatchObject({ level: "Không rõ", source: "Chưa có dữ liệu" });
  });
});

describe("nhận diện case", () => {
  it("đọc điều kiện, 'Như A2' kế thừa điều kiện, phần chữ tự do để sales kiểm", () => {
    const a3 = parseConditions(cases[2].signals, cases);
    expect(a3.filter((c) => c.kind !== "manual")).toHaveLength(5);
    expect(a3.at(-1)).toEqual({ kind: "manual", raw: "ngành dịch vụ làm đẹp / chăm sóc" });
    const a1 = parseConditions(cases[0].signals, cases);
    expect(a1.map((c) => c.kind)).toEqual(["text", "num", "text", "rating", "text"]);
  });

  it("khách khu phố Tây, ít review, chưa có Trip → tự chọn A1", () => {
    const c = client({
      place: { reviewCount: 60, rating: 4.1 },
      criteria: { AREA: "khu phố Tây", "MAP-POST": "Yếu", "TRIP-VERIFIED": "Yếu" },
    });
    const s = suggestCase(cases, evaluateCriteria(criteria, c), c);
    expect(s.pick).toBe("A1");
    expect(s.needsReview).toBe(false);
  });

  it("A2 và A3 hoà → cần người chọn; ngành khách phá hoà", () => {
    const base = {
      place: { reviewCount: 300, rating: 4.2 },
      criteria: { AREA: "thành phố du lịch", "MAP-POST": "Trung bình", "TRIP-VERIFIED": "Yếu" },
    };
    const fnb = client({ ...base, industry: "F&B" });
    const tie = suggestCase(cases, evaluateCriteria(criteria, fnb), fnb);
    expect(tie.pick).toBeNull();
    expect(tie.reason).toContain("Hoà");

    const spa = client({ ...base, industry: "Spa & làm đẹp" });
    expect(suggestCase(cases, evaluateCriteria(criteria, spa), spa).pick).toBe("A3");
    const nh = client({ ...base, industry: "Nhà hàng" });
    expect(suggestCase(cases, evaluateCriteria(criteria, nh), nh).pick).toBe("A2");
  });

  it("chưa thu thập gì → không tự chọn", () => {
    const c = client({});
    const s = suggestCase(cases, evaluateCriteria(criteria, c), c);
    expect(s.pick).toBeNull();
    expect(s.reason).toContain("Chưa đủ dữ liệu");
  });
});
