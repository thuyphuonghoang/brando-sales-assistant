// Cấu hình nghiệp vụ dùng chung (client + server). Giá trị lấy từ biến môi trường NEXT_PUBLIC_*
// để đổi mà không cần sửa code. Lưu ý: tên miền cũng được hard-code trong firestore.rules —
// đổi tên miền thì sửa cả hai nơi.

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
}

export const appConfig = {
  /** Chỉ email thuộc tên miền này được đăng nhập. */
  allowedDomain: (process.env.NEXT_PUBLIC_ALLOWED_DOMAIN || "brando.vn").toLowerCase(),
  /** Chiết khấu (%) vượt ngưỡng này → báo giá chuyển "Chờ duyệt". */
  discountApprovalThreshold: num(process.env.NEXT_PUBLIC_DISCOUNT_APPROVAL_THRESHOLD, 10),
  /** VAT mặc định (%). */
  vatPercent: num(process.env.NEXT_PUBLIC_VAT_PERCENT, 8),
  /** Số ngày hiệu lực của báo giá. */
  quoteValidityDays: num(process.env.NEXT_PUBLIC_QUOTE_VALIDITY_DAYS, 15),
  /** Thời gian khoá mềm một field khi có người đang sửa. */
  fieldLockMs: 60_000,
  /** Nhịp cập nhật presence. */
  presenceHeartbeatMs: 20_000,
  presenceStaleMs: 45_000,
  defaultPaymentTerms:
    process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_TERMS ||
    "Thanh toán 50% khi ký hợp đồng, 50% còn lại khi nghiệm thu từng giai đoạn.",
  defaultTimeline:
    process.env.NEXT_PUBLIC_DEFAULT_TIMELINE ||
    "Triển khai trong vòng 7 ngày làm việc kể từ khi ký hợp đồng.",
};

export function isAllowedEmail(email: string | null | undefined, domain = appConfig.allowedDomain): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return false;
  return e.slice(at + 1) === domain.toLowerCase();
}
