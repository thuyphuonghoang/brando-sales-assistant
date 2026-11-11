"use client";
import { useMemo, useState } from "react";
import { collection, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { firebase } from "@/lib/firebase/client";
import { buildLines, computeTotals, formatVnd, needsApproval } from "@/lib/pricing";
import { QUOTE_STATUS_LABELS, type AssessmentDoc, type Client, type Quote } from "@/lib/types";
import { useCatalog, useQuery } from "@/hooks/firestore";
import { useAuth } from "@/components/auth-provider";
import { QuotePreview } from "@/components/quote-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Selection } from "./services-tab";

export function QuotesTab({
  client,
  assessment,
  selection,
}: {
  client: Client;
  assessment: AssessmentDoc | null;
  selection: Selection | null;
}) {
  const { user } = useAuth();
  const quotes = useQuery<Quote>(
    user ? () => query(collection(firebase().db, "clients", client.id, "quotes"), orderBy("version", "desc")) : null,
    `${client.id}-quotes-${user?.uid}`,
  ).data;
  const [dismissed, setDismissed] = useState<Selection | null>(null);

  return (
    <div className="space-y-4">
      {selection && selection !== dismissed ? (
        <QuoteBuilder client={client} assessment={assessment} selection={selection} onDone={() => setDismissed(selection)} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Để lập báo giá mới: vào tab <b>Dịch vụ</b>, chọn phương án rồi bấm “Lập báo giá”.
        </p>
      )}
      {quotes.map((q) => (
        <QuoteCard key={q.id} client={client} q={q} />
      ))}
    </div>
  );
}

function QuoteBuilder({
  client,
  assessment,
  selection,
  onDone,
}: {
  client: Client;
  assessment: AssessmentDoc | null;
  selection: Selection;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { prices, stats } = useCatalog();
  const priceMap = useMemo(() => new Map(prices.map((p) => [p.code, p])), [prices]);
  const a = assessment ? (assessment.edited ?? assessment.ai) : null;
  const [discount, setDiscount] = useState(0);
  const [showBenefits, setShowBenefits] = useState(true);
  const [benefits, setBenefits] = useState<{ text: string; statId?: string }[]>(() =>
    (a?.opportunities ?? []).slice(0, 3).map((text) => ({ text })),
  );
  const [paymentTerms, setPaymentTerms] = useState(appConfig.defaultPaymentTerms);
  const [timeline, setTimeline] = useState(appConfig.defaultTimeline);
  const [busy, setBusy] = useState(false);
  const relevantStats = stats.filter((s) => s.industry === "*" || s.industry === client.industry);

  let computed: { lines: ReturnType<typeof buildLines>; totals: ReturnType<typeof computeTotals> } | null = null;
  let previewError: string | null = null;
  try {
    const lines = buildLines(selection.items, priceMap);
    computed = { lines, totals: computeTotals(lines, discount, appConfig.vatPercent) };
  } catch (e) {
    previewError = (e as Error).message;
  }
  const today = new Date();
  const until = new Date(today);
  until.setDate(until.getDate() + appConfig.quoteValidityDays);
  const preview = computed ? (
      <QuotePreview
        q={{
          lines: computed.lines,
          totals: computed.totals,
          clientSnapshot: { name: client.name, industry: client.industry, address: client.place?.address },
          issueDate: today.toLocaleDateString("vi-VN"),
          validUntil: until.toLocaleDateString("vi-VN"),
          validityDays: appConfig.quoteValidityDays,
          ownerName: user?.displayName ?? "",
          ownerEmail: user?.email ?? "",
          showBenefits,
          benefits: benefits.map((b) => {
            const s = relevantStats.find((x) => x.id === b.statId);
            return { text: b.text, stat: s ? { statId: s.id, text: s.stat_text, source_name: s.source_name, source_url: s.source_url, year: s.year } : undefined };
          }),
          paymentTerms,
          timeline,
        }}
      />
    ) : (
      <p className="text-sm text-destructive">{previewError}</p>
    );

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ version: number; status: string }>(`/api/clients/${client.id}/quotes`, "POST", {
        packageName: selection.packageName,
        items: selection.items,
        discountPercent: discount,
        showBenefits,
        benefits: benefits.filter((b) => b.text.trim()),
        paymentTerms,
        timeline,
      });
      toast.success(
        r.status === "pending_approval" ? `Đã tạo báo giá v${r.version} — chờ trưởng nhóm duyệt chiết khấu` : `Đã tạo báo giá v${r.version}`,
      );
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lập báo giá — {selection.packageName}</CardTitle>
          <CardDescription>Thành tiền chính thức do server tính từ bảng giá tại thời điểm tạo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="q-discount">Chiết khấu (%)</Label>
            <Input
              id="q-discount"
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            />
            {needsApproval(discount, appConfig.discountApprovalThreshold) && (
              <p className="text-xs text-amber-600">
                Vượt {appConfig.discountApprovalThreshold}% → báo giá sẽ ở trạng thái “Chờ duyệt” và email cho trưởng nhóm.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch id="q-benefits" checked={showBenefits} onCheckedChange={(v) => setShowBenefits(!!v)} />
            <Label htmlFor="q-benefits">Hiện phần “Lợi ích cho doanh nghiệp”</Label>
          </div>
          {showBenefits && (
            <div className="space-y-2">
              {benefits.map((b, i) => (
                <div key={i} className="space-y-1 rounded border p-2">
                  <Input
                    value={b.text}
                    onChange={(e) => setBenefits(benefits.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                  <div className="flex gap-2">
                    <select
                      className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                      value={b.statId ?? ""}
                      onChange={(e) => setBenefits(benefits.map((x, j) => (j === i ? { ...x, statId: e.target.value || undefined } : x)))}
                    >
                      <option value="">Không kèm số liệu</option>
                      {relevantStats.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.stat_text} ({s.value}) — {s.source_name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => setBenefits(benefits.filter((_, j) => j !== i))}>
                      Bỏ
                    </Button>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setBenefits([...benefits, { text: "" }])}>
                + Thêm lợi ích
              </Button>
              <p className="text-xs text-muted-foreground">Số liệu chỉ được lấy từ thư viện STATS; câu có số khác sẽ bị loại.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="q-terms">Điều khoản thanh toán</Label>
            <Textarea id="q-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="q-timeline">Tiến độ</Label>
            <Textarea id="q-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy} data-testid="create-quote">
              Tạo báo giá
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Huỷ
            </Button>
          </div>
        </CardContent>
      </Card>
      <div>
        <div className="mb-2 text-sm font-medium">Xem trước</div>
        {preview}
      </div>
    </div>
  );
}

function QuoteCard({ client, q }: { client: Client; q: Quote }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const isApprover = user && (user.role === "admin" || (user.role === "lead" && user.teamId === client.teamId));

  const act = async (action: string) => {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/quotes/${q.id}/status`, "POST", { action });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pdf = async () => {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/quotes/${q.id}/pdf`, "POST");
      toast.success("Đã tạo PDF và lưu vào Drive");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="quote-card" data-version={q.version}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Báo giá v{q.version} — {q.packageName}
          <Badge variant={q.status === "pending_approval" ? "destructive" : "secondary"} data-testid="quote-status">
            {QUOTE_STATUS_LABELS[q.status]}
          </Badge>
        </CardTitle>
        <CardDescription>
          {formatVnd(q.totals.total)} · chiết khấu {q.totals.discountPercent}% · tạo {new Date(q.createdAt).toLocaleString("vi-VN")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {q.status === "pending_approval" && isApprover && (
            <>
              <Button size="sm" onClick={() => act("approve")} disabled={busy}>Duyệt chiết khấu</Button>
              <Button size="sm" variant="outline" onClick={() => act("decline_approval")} disabled={busy}>Không duyệt</Button>
            </>
          )}
          {q.status !== "pending_approval" && (
            <Button size="sm" variant="outline" onClick={pdf} disabled={busy} data-testid="make-pdf">
              {q.pdfUrl ? "Tạo lại PDF" : "Xuất PDF → Drive"}
            </Button>
          )}
          {q.status === "draft" && (
            <Button size="sm" onClick={() => act("send")} disabled={busy}>Đánh dấu đã gửi</Button>
          )}
          {q.status === "sent" && (
            <>
              <Button size="sm" onClick={() => act("accept")} disabled={busy}>Khách đồng ý</Button>
              <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={busy}>Khách từ chối</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "Ẩn chi tiết" : "Xem chi tiết"}
          </Button>
        </div>
        {(q.pdfUrl || q.driveFolderUrl) && (
          <div className="flex flex-wrap gap-3 text-sm">
            {q.pdfUrl && <a className="underline" href={q.pdfUrl} target="_blank" rel="noreferrer" data-testid="pdf-link">PDF</a>}
            {q.docUrl && <a className="underline" href={q.docUrl} target="_blank" rel="noreferrer">Google Docs</a>}
            {q.driveFolderUrl && <a className="underline" href={q.driveFolderUrl} target="_blank" rel="noreferrer">Thư mục Drive</a>}
          </div>
        )}
        {open && <QuotePreview q={q} />}
      </CardContent>
    </Card>
  );
}
