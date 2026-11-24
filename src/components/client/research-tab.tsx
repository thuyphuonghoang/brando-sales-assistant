"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { SECTION_LABELS, type Client, type PlaceInfo, type SectionKey } from "@/lib/types";
import type { FieldLock } from "@/hooks/collab";
import { CommentThread } from "@/components/collab-widgets";
import { EditableField } from "@/components/editable-field";
import { SourceBadge } from "@/components/source-badge";
import { StandardScoreCard } from "./standard-score";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Các field cộng tác của từng section. */
export const SECTION_FIELDS: Record<SectionKey, { key: string; label: string; multiline?: boolean }[]> = {
  company_info: [
    { key: "description", label: "Mô tả doanh nghiệp", multiline: true },
    { key: "products", label: "Sản phẩm / dịch vụ chính", multiline: true },
    { key: "target_customers", label: "Khách hàng mục tiêu" },
    { key: "locations", label: "Khu vực / chi nhánh" },
  ],
  online_presence: [
    { key: "website_notes", label: "Nhận xét website", multiline: true },
    { key: "social_notes", label: "Nhận xét mạng xã hội", multiline: true },
    { key: "gbp_notes", label: "Nhận xét hồ sơ Google", multiline: true },
  ],
  competitors: [{ key: "notes", label: "Ghi chú về đối thủ", multiline: true }],
  industry_notes: [{ key: "notes", label: "Đặc thù ngành / mùa vụ", multiline: true }],
  meeting_notes: [{ key: "summary", label: "Tóm tắt nội bộ sau các buổi gặp", multiline: true }],
};

export function SectionCard({
  client,
  section,
  locks,
  children,
}: {
  client: Client;
  section: SectionKey;
  locks: Record<string, FieldLock>;
  children?: React.ReactNode;
}) {
  return (
    <Card data-section={section}>
      <CardHeader>
        <CardTitle>{SECTION_LABELS[section]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {SECTION_FIELDS[section].map((f) => (
          <EditableField
            key={f.key}
            clientId={client.id}
            path={`sections.${section}.${f.key}`}
            label={f.label}
            value={client.sections?.[section]?.[f.key]}
            locks={locks}
            multiline={f.multiline}
          />
        ))}
        <CommentThread clientId={client.id} section={section} />
      </CardContent>
    </Card>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  mapsUrl: "Google Maps",
  fanpage: "Fanpage",
  taxCode: "Mã số thuế",
  tiktok: "TikTok",
  instagram: "Instagram",
};

function PlaceSummary({ place }: { place: PlaceInfo }) {
  const rows: [string, React.ReactNode][] = [
    ["Tên", place.name],
    ["Danh mục", place.category ?? "Không rõ"],
    ["Địa chỉ", place.address ?? "Không rõ"],
    ["Điện thoại", place.phone ?? "Không rõ"],
    ["Website", place.website ? <a className="underline" href={place.website} target="_blank" rel="noreferrer">{place.website}</a> : "Không rõ"],
    ["Mô tả", place.description ?? "Không rõ"],
    ["Điểm sao", place.rating != null ? `${place.rating} ★` : "Không rõ"],
    ["Số đánh giá", place.reviewCount ?? "Không rõ"],
    ["Số ảnh", place.photoCount != null ? (place.photoCount >= 10 ? "≥ 10" : place.photoCount) : "Không rõ"],
    ["Nút hành động", place.actionButtons?.length ? place.actionButtons.join(", ") : "Không rõ"],
    ["Giờ mở cửa", place.hours?.length ? place.hours.join(" · ") : "Không rõ"],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[140px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {!!place.recentReviews?.length && (
        <div>
          <div className="mb-1 text-sm font-medium">Đánh giá gần đây</div>
          <ul className="space-y-1 text-sm">
            {place.recentReviews.map((r, i) => (
              <li key={i} className="rounded bg-muted/50 p-2">
                <span className="font-medium">{r.rating ?? "?"}★</span> {r.text}{" "}
                <span className="text-xs text-muted-foreground">— {r.author ?? "Ẩn danh"}, {r.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ResearchTab({ client, locks }: { client: Client; locks: Record<string, FieldLock> }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ found: boolean; competitors: number }>(`/api/clients/${client.id}/research`, "POST");
      if (r.found) toast.success(`Đã thu thập hồ sơ Google và ${r.competitors} đối thủ`);
      else toast.warning("Không tìm thấy doanh nghiệp trên Google Maps — kiểm tra tên hoặc link Maps");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const b = client.business ?? {};
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Kênh khai báo</CardTitle>
          <CardDescription>
            Dữ liệu chỉ lấy qua API chính thức (Google Places). Không scrape nền tảng nào.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(client.inputs).map(([k, v]) => (
              <li key={k} className="truncate">
                <span className="text-muted-foreground">{CHANNEL_LABELS[k] ?? k}:</span> {v}
              </li>
            ))}
          </ul>
          <Button onClick={run} disabled={busy} data-testid="run-research">
            {busy ? "Đang thu thập…" : client.researchedAt ? "Thu thập lại dữ liệu" : "Thu thập dữ liệu"}
          </Button>
          {client.researchedAt && (
            <p className="text-xs text-muted-foreground">Lần cuối: {new Date(client.researchedAt).toLocaleString("vi-VN")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Google Business Profile <SourceBadge source="Thu thập" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.place ? <PlaceSummary place={client.place} /> : <p className="text-sm text-muted-foreground">Không rõ — chưa thu thập.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Đối thủ cùng khu vực <SourceBadge source="Thu thập" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.competitors?.length ? (
            <div className="overflow-x-auto">
              <Table data-testid="competitors-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên</TableHead>
                    <TableHead>Sao</TableHead>
                    <TableHead>Đánh giá</TableHead>
                    <TableHead>Ảnh</TableHead>
                    <TableHead>Website</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.place && (
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell>{client.place.name} (khách)</TableCell>
                      <TableCell>{client.place.rating ?? "Không rõ"}</TableCell>
                      <TableCell>{client.place.reviewCount ?? "Không rõ"}</TableCell>
                      <TableCell>{client.place.photoCount ?? "Không rõ"}</TableCell>
                      <TableCell>{client.place.website ? "Có" : "Không"}</TableCell>
                    </TableRow>
                  )}
                  {client.competitors.map((c) => (
                    <TableRow key={c.placeId} data-testid="competitor-row">
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.rating ?? "Không rõ"}</TableCell>
                      <TableCell>{c.reviewCount ?? "Không rõ"}</TableCell>
                      <TableCell>{c.photoCount ?? "Không rõ"}</TableCell>
                      <TableCell>{c.website ? "Có" : "Không"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Không rõ — chưa thu thập.</p>
          )}
        </CardContent>
      </Card>

      <StandardScoreCard client={client} />

      <Card>
        <CardHeader>
          <CardTitle>Thông tin kinh doanh</CardTitle>
          <CardDescription>Chỉ ghi thông tin cần thiết (Luật Bảo vệ dữ liệu cá nhân) — không lưu số CCCD, địa chỉ nhà riêng…</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <EditableField clientId={client.id} path="business.goals" label="Mục tiêu kinh doanh" value={b.goals} locks={locks} multiline />
          </div>
          <EditableField clientId={client.id} path="business.budget" label="Ngân sách marketing (VND)" value={b.budget} locks={locks} type="number" />
          <EditableField clientId={client.id} path="business.investment" label="Vốn đầu tư ước tính (VND)" value={b.investment} locks={locks} type="number" />
          <EditableField clientId={client.id} path="business.decisionMaker" label="Người quyết định (chức danh)" value={b.decisionMaker} locks={locks} hint="Vd: Chủ doanh nghiệp, Giám đốc marketing" />
          <EditableField clientId={client.id} path="business.timeline" label="Thời hạn" value={b.timeline} locks={locks} />
        </CardContent>
      </Card>

      {(["company_info", "online_presence", "competitors", "industry_notes"] as const).map((s) => (
        <SectionCard key={s} client={client} section={s} locks={locks} />
      ))}
    </div>
  );
}
