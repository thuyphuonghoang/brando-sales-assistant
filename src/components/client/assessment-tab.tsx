"use client";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Assessment, AssessmentDoc, CheckResult, Client } from "@/lib/types";
import { useCatalog } from "@/hooks/firestore";
import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RESULT_STYLE: Record<CheckResult, string> = {
  "Đạt": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "Chưa đạt": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "Không rõ": "bg-muted text-muted-foreground",
};

export function ResultPill({ r }: { r: CheckResult | string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[r as CheckResult] ?? ""}`}>{r}</span>;
}

export function AssessmentTab({ client, assessment }: { client: Client; assessment: AssessmentDoc | null }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const generate = async () => {
    if (assessment && !confirm("Tạo lại nhận định sẽ thay bản AI hiện tại và bỏ bản đã sửa. Tiếp tục?")) return;
    setBusy(true);
    try {
      const r = await api<{ removedSentences: number }>(`/api/clients/${client.id}/assessment`, "POST");
      toast.success(
        r.removedSentences ? `Đã tạo nhận định (loại ${r.removedSentences} câu có số liệu ngoài thư viện)` : "Đã tạo nhận định",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const r = await api<{ removedSentences: number }>(`/api/clients/${client.id}/assessment`, "PUT", editing);
      toast.success(r.removedSentences ? `Đã lưu (loại ${r.removedSentences} câu có số liệu ngoài thư viện)` : "Đã lưu bản sửa");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    if (!confirm("Bỏ bản đã sửa và quay về bản AI gốc?")) return;
    await api(`/api/clients/${client.id}/assessment`, "DELETE").catch((e) => toast.error(e.message));
  };

  if (!assessment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nhận định</CardTitle>
          <CardDescription>
            {client.place ? "Dữ liệu đã sẵn sàng." : "Nên thu thập dữ liệu ở tab Research trước để nhận định chính xác hơn."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={generate} disabled={busy} data-testid="run-assessment">
            {busy ? "AI đang phân tích…" : "Tạo nhận định (AI)"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) return <AssessmentEditor value={editing} onChange={setEditing} onSave={saveEdit} onCancel={() => setEditing(null)} busy={busy} />;

  const a = showOriginal || !assessment.edited ? assessment.ai : assessment.edited;
  const label = showOriginal || !assessment.edited ? "AI nhận định" : "Sales nhập";

  return (
    <div className="space-y-4" data-testid="assessment">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(structuredClone(assessment.edited ?? assessment.ai))}>
          Sửa nhận định
        </Button>
        <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo lại (AI)"}
        </Button>
        {assessment.edited && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowOriginal(!showOriginal)}>
              {showOriginal ? "Xem bản đã sửa" : "Xem bản AI gốc"}
            </Button>
            <Button variant="ghost" size="sm" onClick={revert}>
              Khôi phục bản AI
            </Button>
          </>
        )}
        <span className="text-xs text-muted-foreground">
          {assessment.model} · {new Date(assessment.generatedAt).toLocaleString("vi-VN")}
          {assessment.edited && assessment.editedAt ? ` · sửa lúc ${new Date(assessment.editedAt).toLocaleString("vi-VN")}` : ""}
        </span>
      </div>
      <AssessmentView a={a} label={label} />
    </div>
  );
}

function AssessmentView({ a, label }: { a: Assessment; label: "AI nhận định" | "Sales nhập" }) {
  const statById = new Map(a.stats.map((s) => [s.statId, s]));
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Bảng chấm điểm theo ngành <SourceBadge source={label} />
          </CardTitle>
          <CardDescription>
            Điểm hiện diện: <span className="text-lg font-semibold text-foreground" data-testid="score">{a.score}/100</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="scorecard">
            <TableHeader>
              <TableRow>
                <TableHead>Tiêu chí</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="hidden sm:table-cell">Căn cứ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.scorecard.map((r) => (
                <TableRow key={r.item_code}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell>
                    <ResultPill r={r.result} />
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-sm text-muted-foreground sm:table-cell">{r.evidence}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            So sánh đối thủ & giai đoạn hụt <SourceBadge source={label} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p data-testid="competitor-comparison">{a.competitorComparison}</p>
          <div className="flex flex-wrap items-center gap-2">
            {(["BIẾT", "HIỂU", "TIN", "MUA"] as const).map((s) => (
              <Badge key={s} variant={a.funnelGap === s ? "destructive" : "outline"}>
                {s}
              </Badge>
            ))}
          </div>
          <p>{a.funnelReason}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            3 vấn đề ưu tiên <SourceBadge source={label} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {a.problems.map((p, i) => (
              <li key={i} className="text-sm" data-testid="problem">
                <div className="font-medium">
                  {i + 1}. {p.title} <code className="text-xs text-muted-foreground">{p.problem_code}</code>
                </div>
                <p>{p.detail}</p>
                {p.statIds.map((sid) => {
                  const s = statById.get(sid);
                  return s ? (
                    <p key={sid} className="text-xs text-muted-foreground">
                      Nguồn: <a href={s.source_url} target="_blank" rel="noreferrer" className="underline">{s.source_name}</a> ({s.year})
                    </p>
                  ) : null;
                })}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cơ hội <SourceBadge source={label} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {a.opportunities.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Gợi ý câu nói 4T <SourceBadge source={label} />
            <Badge variant="outline">Nội bộ</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(
            [
              ["Tác dụng", a.pitch4T.tacDung],
              ["Tương xứng", a.pitch4T.tuongXung],
              ["Tin tưởng", a.pitch4T.tinTuong],
              ["Tăng trưởng", a.pitch4T.tangTruong],
            ] as const
          ).map(([k, v]) => (
            <p key={k}>
              <span className="font-medium">{k}:</span> {v}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Phản đối dự kiến <SourceBadge source={label} />
            <Badge variant="outline">Nội bộ</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {a.objections.map((o, i) => (
            <div key={i}>
              <p className="font-medium">“{o.objection}”</p>
              <p className="text-muted-foreground">→ {o.response}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {a.stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Số liệu đã dùng (thư viện STATS)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm" data-testid="stats-used">
              {a.stats.map((s) => (
                <li key={s.statId}>
                  {s.text} —{" "}
                  <a className="underline" href={s.source_url} target="_blank" rel="noreferrer">
                    {s.source_name}
                  </a>{" "}
                  ({s.year})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AssessmentEditor({
  value: a,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: Assessment;
  onChange: (a: Assessment) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { rules } = useCatalog();
  const codes = [...new Set(rules.map((r) => r.problem_code))];
  const set = (patch: Partial<Assessment>) => onChange({ ...a, ...patch });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bản AI gốc luôn được giữ lại. Câu nào chứa số liệu không có trong thư viện STATS sẽ bị loại khi lưu.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Chấm điểm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {a.scorecard.map((r, i) => (
            <div key={r.item_code} className="grid gap-2 sm:grid-cols-[1fr_130px_2fr]">
              <span className="text-sm">{r.label}</span>
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={r.result}
                onChange={(e) => {
                  const sc = [...a.scorecard];
                  sc[i] = { ...r, result: e.target.value as CheckResult };
                  set({ scorecard: sc });
                }}
              >
                {["Đạt", "Chưa đạt", "Không rõ"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <Input
                value={r.evidence}
                onChange={(e) => {
                  const sc = [...a.scorecard];
                  sc[i] = { ...r, evidence: e.target.value };
                  set({ scorecard: sc });
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>So sánh đối thủ & giai đoạn hụt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={a.competitorComparison} onChange={(e) => set({ competitorComparison: e.target.value })} />
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={a.funnelGap}
            onChange={(e) => set({ funnelGap: e.target.value as Assessment["funnelGap"] })}
          >
            {["BIẾT", "HIỂU", "TIN", "MUA", "Không rõ"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <Textarea value={a.funnelReason} onChange={(e) => set({ funnelReason: e.target.value })} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vấn đề ưu tiên</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.problems.map((p, i) => {
            const upd = (patch: Partial<typeof p>) => {
              const ps = [...a.problems];
              ps[i] = { ...p, ...patch };
              set({ problems: ps });
            };
            return (
              <div key={i} className="space-y-1 rounded border p-2">
                <div className="flex gap-2">
                  <Input value={p.title} onChange={(e) => upd({ title: e.target.value })} />
                  <select className="rounded-md border bg-background px-2 text-sm" value={p.problem_code} onChange={(e) => upd({ problem_code: e.target.value })}>
                    {[...new Set([p.problem_code, ...codes])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <Textarea value={p.detail} onChange={(e) => upd({ detail: e.target.value })} />
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cơ hội (mỗi dòng một ý)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={a.opportunities.join("\n")}
            onChange={(e) => set({ opportunities: e.target.value.split("\n").filter((x) => x.trim()) })}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Gợi ý câu nói 4T</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(
            [
              ["tacDung", "Tác dụng"],
              ["tuongXung", "Tương xứng"],
              ["tinTuong", "Tin tưởng"],
              ["tangTruong", "Tăng trưởng"],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <span className="text-xs text-muted-foreground">{l}</span>
              <Textarea value={a.pitch4T[k]} onChange={(e) => set({ pitch4T: { ...a.pitch4T, [k]: e.target.value } })} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Phản đối dự kiến</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {a.objections.map((o, i) => (
            <div key={i} className="space-y-1">
              <Input
                value={o.objection}
                onChange={(e) => {
                  const os = [...a.objections];
                  os[i] = { ...o, objection: e.target.value };
                  set({ objections: os });
                }}
              />
              <Textarea
                value={o.response}
                onChange={(e) => {
                  const os = [...a.objections];
                  os[i] = { ...o, response: e.target.value };
                  set({ objections: os });
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={busy}>
          Lưu bản sửa
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
