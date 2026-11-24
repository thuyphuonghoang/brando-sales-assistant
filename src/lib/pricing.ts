// Tính tiền báo giá. CHỈ được gọi ở server khi lưu báo giá (client chỉ dùng để xem trước).
import type { PriceItem, QuoteLine, QuoteTotals } from "./types";

/** Làm tròn về đồng (VND không có số lẻ). */
export function roundVnd(n: number): number {
  return Math.round(n);
}

export class PricingError extends Error {}

export function buildLines(
  selected: { code: string; quantity: number }[],
  priceByCode: Map<string, PriceItem>,
): QuoteLine[] {
  return selected.map(({ code, quantity }) => {
    const p = priceByCode.get(code);
    if (!p) throw new PricingError(`Không tìm thấy dịch vụ mã ${code} trong bảng giá`);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new PricingError(`Số lượng không hợp lệ cho ${code}`);
    }
    return {
      code: p.code,
      name: p.name,
      description: p.description,
      unit: p.unit,
      quantity,
      unitPrice: p.price,
      amount: roundVnd(p.price * quantity),
      priceEffectiveFrom: p.effective_from,
    };
  });
}

export function computeTotals(lines: QuoteLine[], discountPercent: number, vatPercent: number): QuoteTotals {
  if (discountPercent < 0 || discountPercent > 100) throw new PricingError("Chiết khấu phải từ 0 đến 100%");
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const discountAmount = roundVnd((subtotal * discountPercent) / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = roundVnd((afterDiscount * vatPercent) / 100);
  return {
    subtotal,
    discountPercent,
    discountAmount,
    afterDiscount,
    vatPercent,
    vatAmount,
    total: afterDiscount + vatAmount,
  };
}

export function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

/** Đơn giá 0 = dịch vụ giá linh hoạt (báo giá riêng) → báo giá có dòng này phải chờ duyệt. */
export function flexibleLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((l) => l.unitPrice === 0);
}

export function needsApproval(discountPercent: number, threshold: number): boolean {
  return discountPercent > threshold;
}
