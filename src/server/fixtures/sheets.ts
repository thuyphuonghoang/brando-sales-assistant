// Dữ liệu mẫu dùng khi GOOGLE_MODE=mock (phát triển trên emulator, chạy test).
// Định dạng giống hệt các hàng đọc từ Google Sheets (hàng đầu là tiêu đề).

export const priceRows = [
  ["code", "name", "group", "description", "unit", "price", "effective_from"],
  ["GBP-OPT", "Tối ưu Google Business Profile", "Local SEO", "Chuẩn hoá thông tin, danh mục, ảnh, bài đăng GBP", "gói", "3.500.000", "2026-01-01"],
  ["REVIEW-MGMT", "Quản trị đánh giá", "Uy tín", "Quy trình xin và phản hồi đánh giá trong 1 tháng", "tháng", "4.000.000", "2026-01-01"],
  ["FB-CONTENT", "Nội dung fanpage", "Social", "12 bài/tháng kèm thiết kế", "tháng", "8.000.000", "2026-01-01"],
  ["ADS-META", "Quảng cáo Meta", "Quảng cáo", "Quản lý chiến dịch Facebook/Instagram (chưa gồm ngân sách)", "tháng", "6.000.000", "2026-01-01"],
  ["ADS-GG", "Quảng cáo Google", "Quảng cáo", "Quản lý chiến dịch Google Ads (chưa gồm ngân sách)", "tháng", "6.500.000", "2026-01-01"],
  ["WEB-LP", "Landing page", "Website", "Landing page chuyển đổi, tối ưu di động", "trang", "12.000.000", "2026-01-01"],
  ["VIDEO-SHORT", "Video ngắn", "Nội dung", "Video dọc 30–60 giây cho TikTok/Reels", "video", "2.500.000", "2026-01-01"],
  ["BRAND-ID", "Bộ nhận diện thương hiệu", "Thương hiệu", "Logo, màu sắc, font, hướng dẫn sử dụng", "bộ", "25.000.000", "2026-01-01"],
];

export const ruleRows = [
  ["industry", "problem_code", "service_codes"],
  ["*", "LOW_VISIBILITY", "GBP-OPT, ADS-GG"],
  ["*", "FEW_REVIEWS", "REVIEW-MGMT, GBP-OPT"],
  ["*", "WEAK_SOCIAL", "FB-CONTENT, VIDEO-SHORT"],
  ["*", "NO_WEBSITE", "WEB-LP"],
  ["*", "LOW_CONVERSION", "WEB-LP, ADS-META"],
  ["*", "WEAK_BRAND", "BRAND-ID, FB-CONTENT"],
  ["F&B", "WEAK_SOCIAL", "VIDEO-SHORT, FB-CONTENT, ADS-META"],
  ["Nha khoa / Y tế", "FEW_REVIEWS", "REVIEW-MGMT, GBP-OPT, VIDEO-SHORT"],
];

const checklistHeader = ["item_code", "label", "how_to_check", "weight"];
export const industryTabs: Record<string, (string | number)[][]> = {
  "F&B": [
    checklistHeader,
    ["GBP_COMPLETE", "Hồ sơ Google đầy đủ", "Có giờ mở cửa, điện thoại, website, mô tả", 3],
    ["GBP_PHOTOS", "Ảnh món ăn / không gian", "Hồ sơ Google có nhiều ảnh", 2],
    ["REVIEWS", "Đánh giá tốt và nhiều", "Điểm sao cao, nhiều đánh giá gần đây", 3],
    ["MENU_ONLINE", "Có menu online", "Website hoặc fanpage có menu", 2],
    ["SOCIAL_ACTIVE", "Mạng xã hội hoạt động", "Có fanpage/TikTok/Instagram", 2],
  ],
  "Nha khoa / Y tế": [
    checklistHeader,
    ["GBP_COMPLETE", "Hồ sơ Google đầy đủ", "Có giờ mở cửa, điện thoại, website, mô tả", 3],
    ["REVIEWS", "Đánh giá tốt và nhiều", "Điểm sao cao, nhiều đánh giá", 3],
    ["WEBSITE", "Có website giới thiệu bác sĩ, dịch vụ", "Website hoạt động", 2],
    ["BOOKING", "Đặt lịch online", "Có nút đặt lịch/gọi trên Google", 2],
  ],
  "Giáo dục": [
    checklistHeader,
    ["GBP_COMPLETE", "Hồ sơ Google đầy đủ", "Có giờ, điện thoại, website", 2],
    ["WEBSITE", "Website có chương trình học", "Website hoạt động", 3],
    ["REVIEWS", "Đánh giá phụ huynh/học viên", "Điểm sao, số đánh giá", 2],
    ["SOCIAL_ACTIVE", "Mạng xã hội hoạt động", "Có fanpage/TikTok", 2],
  ],
};

export const statRows = [
  ["industry", "stat_text", "value", "source_name", "source_url", "year"],
  ["*", "Phần lớn người tiêu dùng đọc đánh giá trực tuyến trước khi chọn doanh nghiệp địa phương", "87%", "[Nguồn mẫu – thay bằng nguồn thật]", "https://example.com/nguon-mau-1", "2025"],
  ["F&B", "Thực khách xem ảnh món ăn trên Google Maps trước khi đến quán", "70%", "[Nguồn mẫu – thay bằng nguồn thật]", "https://example.com/nguon-mau-2", "2025"],
  ["Nha khoa / Y tế", "Bệnh nhân tìm phòng khám qua tìm kiếm trực tuyến", "77%", "[Nguồn mẫu – thay bằng nguồn thật]", "https://example.com/nguon-mau-3", "2024"],
];

// Bộ chuẩn (mock): tab "Case" và tab "Gói", cùng bố cục như sheet thật (bảng tóm tắt + bảng chi tiết).
export const caseRows = [
  ["Mã case", "Ngành tham chiếu", "Điều kiện nhận diện (theo tab Tiêu chí)", "Nhóm dịch vụ", "Mục tiêu tư vấn", "Dịch vụ chính (mã trong Bảng giá)"],
  ["M1", "Quán ăn local", "MAP-REV < 100; chưa đăng bài", "Nhận biết", "Có thêm khách cho cơ sở", "GBP-OPT, REVIEW-MGMT"],
];

export const packageRows = [
  ["Mức ngân sách", "Trần ngân sách (VNĐ)"],
  ["Tiết kiệm", 7000000],
  [],
  ["Mã gói", "Case", "Mức", "Tổng phần giá cố định (VNĐ)", "Số hạng mục giá linh hoạt", "Trần mức (VNĐ)", "So với trần", "Gửi báo giá"],
  ["M1-T", "M1", "Tiết kiệm", 7500000, 0, 7000000, "Vượt trần", "Tự gửi được"],
  ["M1-C", "M1", "Cơ bản", 15500000, 0, 10000000, "Vượt trần", "Chờ anh duyệt"],
  [],
  ["Mã gói", "Case", "Mức", "Mã DV", "Dịch vụ", "Số lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)", "Ghi chú"],
  ["M1-T", "M1", "Tiết kiệm", "GBP-OPT", "Tối ưu Google Business Profile", 1, 3500000, 3500000],
  ["M1-T", "M1", "Tiết kiệm", "REVIEW-MGMT", "Quản trị đánh giá", 1, 4000000, 4000000],
  ["M1-C", "M1", "Cơ bản", "GBP-OPT", "Tối ưu Google Business Profile", 1, 3500000, 3500000],
  ["M1-C", "M1", "Cơ bản", "REVIEW-MGMT", "Quản trị đánh giá", 1, 4000000, 4000000],
  ["M1-C", "M1", "Cơ bản", "FB-CONTENT", "Nội dung fanpage", 1, 8000000, 8000000, "1 tháng"],
];
