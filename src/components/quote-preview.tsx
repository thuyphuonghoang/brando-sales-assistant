import { formatVnd } from "@/lib/pricing";
import type { Quote } from "@/lib/types";

/** Xem trước báo giá (bố cục giống mẫu Google Docs). Dùng cho trình tạo báo giá và bản mock. */
export function QuotePreview({ q }: { q: Pick<Quote, "lines" | "totals" | "clientSnapshot" | "issueDate" | "validUntil" | "validityDays" | "ownerName" | "ownerEmail" | "showBenefits" | "benefits" | "paymentTerms" | "timeline"> & { version?: number } }) {
  const t = q.totals;
  return (
    <div className="space-y-4 rounded-lg border bg-white p-4 text-sm text-neutral-900 sm:p-6" data-testid="quote-preview">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <div className="text-lg font-bold">BÁO GIÁ DỊCH VỤ MARKETING {q.version ? `— v${q.version}` : ""}</div>
          <div>BRANDO</div>
        </div>
        <div className="text-right text-xs">
          <div>Ngày: {q.issueDate}</div>
          <div>
            Hiệu lực: {q.validityDays} ngày (đến {q.validUntil})
          </div>
          <div>Phụ trách: {q.ownerName} — {q.ownerEmail}</div>
        </div>
      </div>
      <div>
        <div className="font-semibold">Khách hàng: {q.clientSnapshot.name}</div>
        <div className="text-xs">
          Ngành: {q.clientSnapshot.industry}
          {q.clientSnapshot.address ? ` · ${q.clientSnapshot.address}` : ""}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className="border p-1.5">Hạng mục</th>
              <th className="border p-1.5">Mô tả</th>
              <th className="border p-1.5 text-right">SL</th>
              <th className="border p-1.5 text-right">Đơn giá</th>
              <th className="border p-1.5 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.code} data-testid="quote-line" data-code={l.code} data-unit-price={l.unitPrice}>
                <td className="border p-1.5">{l.name}</td>
                <td className="border p-1.5">{l.description}</td>
                <td className="border p-1.5 text-right">
                  {l.quantity} {l.unit}
                </td>
                <td className="border p-1.5 text-right">{formatVnd(l.unitPrice)}</td>
                <td className="border p-1.5 text-right">{formatVnd(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="border p-1.5 text-right">Cộng</td>
              <td className="border p-1.5 text-right">{formatVnd(t.subtotal)}</td>
            </tr>
            {t.discountPercent > 0 && (
              <tr>
                <td colSpan={4} className="border p-1.5 text-right">Chiết khấu {t.discountPercent}%</td>
                <td className="border p-1.5 text-right">−{formatVnd(t.discountAmount)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={4} className="border p-1.5 text-right">VAT {t.vatPercent}%</td>
              <td className="border p-1.5 text-right">{formatVnd(t.vatAmount)}</td>
            </tr>
            <tr className="font-bold">
              <td colSpan={4} className="border p-1.5 text-right">TỔNG CỘNG</td>
              <td className="border p-1.5 text-right" data-testid="quote-total">{formatVnd(t.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {q.showBenefits && q.benefits.length > 0 && (
        <div>
          <div className="font-semibold">Lợi ích cho doanh nghiệp</div>
          <ul className="list-disc pl-5">
            {q.benefits.map((b, i) => (
              <li key={i}>
                {b.text}
                {b.stat && (
                  <span className="text-xs text-neutral-500">
                    {" "}
                    (Nguồn: {b.stat.source_name}, {b.stat.year})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="font-semibold">Điều khoản thanh toán</div>
        <p className="whitespace-pre-wrap">{q.paymentTerms}</p>
      </div>
      <div>
        <div className="font-semibold">Tiến độ</div>
        <p className="whitespace-pre-wrap">{q.timeline}</p>
      </div>
    </div>
  );
}
