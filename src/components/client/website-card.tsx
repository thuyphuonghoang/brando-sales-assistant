"use client";
import type { WebsiteAudit } from "@/lib/types";
import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  tripadvisor: "Tripadvisor",
  youtube: "YouTube",
  zalo: "Zalo",
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Badge variant={ok ? "default" : "destructive"}>{ok ? "Có" : "Chưa có"}</Badge>
      {label}
    </li>
  );
}

export function WebsiteCard({ audit }: { audit: WebsiteAudit | null }) {
  return (
    <Card data-testid="website-audit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Khám website <SourceBadge source="Thu thập" />
        </CardTitle>
        {audit && <CardDescription>Kiểm tra lúc {new Date(audit.checkedAt).toLocaleString("vi-VN")} · {audit.finalUrl ?? audit.url}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!audit ? (
          <p className="text-muted-foreground">Chưa khám — bấm “Thu thập dữ liệu”.</p>
        ) : !audit.reachable ? (
          <p className="text-destructive">{audit.error ?? "Không mở được website"}</p>
        ) : (
          <>
            {audit.title && <p className="font-medium">{audit.title}</p>}
            <ul className="grid gap-1.5 sm:grid-cols-2">
              <Check ok={audit.https} label="Bảo mật HTTPS" />
              <Check ok={audit.hasViewport} label="Hiển thị tốt trên điện thoại" />
              <Check ok={audit.hasPhone} label="Số điện thoại / nút gọi" />
              <Check ok={audit.hasBooking} label="Nút đặt bàn / đặt lịch / đặt phòng" />
              <Check ok={audit.hasMenu} label="Menu / bảng giá" />
              <Check ok={audit.hasPrices} label="Có giá dạng chữ" />
              <Check ok={audit.hasSchema} label="Khai báo doanh nghiệp cho Google (schema)" />
              <Check ok={!!audit.description} label="Mô tả trang cho Google" />
            </ul>
            <p>
              Tốc độ trên điện thoại (Google PageSpeed):{" "}
              {audit.mobileScore == null ? (
                <span className="text-muted-foreground">Không đo được</span>
              ) : (
                <Badge variant={audit.mobileScore >= 90 ? "default" : audit.mobileScore >= 50 ? "secondary" : "destructive"}>
                  {audit.mobileScore}/100
                </Badge>
              )}
            </p>
            <p>
              Kênh liên kết trên web:{" "}
              {Object.keys(audit.social).length === 0
                ? "không thấy"
                : Object.entries(audit.social).map(([k, v], i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <a href={v} target="_blank" rel="noreferrer" className="underline">
                        {SOCIAL_LABELS[k] ?? k}
                      </a>
                    </span>
                  ))}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
