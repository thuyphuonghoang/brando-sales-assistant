"use client";
import { useMemo } from "react";
import { toast } from "sonner";
import { categoryOptions, evaluateCriteria, isNumeric, levelOptions, suggestCase } from "@/lib/standard";
import type { CaseDef, Client, Criterion, CriterionLevel, CriterionResult } from "@/lib/types";
import { useCatalog } from "@/hooks/firestore";
import { useFieldActions } from "@/hooks/collab";
import { SourceBadge } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const LEVEL_VARIANT: Record<CriterionLevel, "destructive" | "secondary" | "default" | "outline"> = {
  "Yếu": "destructive",
  "Trung bình": "secondary",
  "Mạnh": "default",
  "Không rõ": "outline",
};

/** Kết quả chấm Bộ chuẩn + case gợi ý cho một khách — dùng ở tab Research và tab Dịch vụ. */
export function useStandardScore(client: Client) {
  const { criteria, cases } = useCatalog();
  return useMemo(() => {
    const results = evaluateCriteria(criteria, client);
    return { criteria, cases, results, suggestion: suggestCase(cases, results, client) };
  }, [criteria, cases, client]);
}

function CriterionInput({ client, c, r }: { client: Client; c: Criterion; r: CriterionResult }) {
  const { save } = useFieldActions(client.id);
  const path = `business.criteria.${c.code}`;
  const current = client.business?.criteria?.[c.code] ?? "";
  const store = (v: string) => save(path, v, `Tiêu chí ${c.code}`).catch((e: Error) => toast.error(e.message));
  const cats = categoryOptions(c);
  const cls = "w-full rounded-md border bg-background px-2 py-1 text-xs";

  if (cats.length) {
    return (
      <select className={cls} aria-label={`Chọn ${c.label}`} value={current} onChange={(e) => store(e.target.value)}>
        <option value="">Chọn…</option>
        {cats.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (isNumeric(c)) {
    return (
      <Input
        key={current}
        type="number"
        min={0}
        className="h-7 text-xs"
        aria-label={`Số liệu ${c.label}`}
        placeholder={r.source === "Thu thập" ? "Tự đo" : "Nhập số"}
        defaultValue={current}
        onBlur={(e) => e.target.value !== current && store(e.target.value)}
      />
    );
  }
  const opts = levelOptions(c);
  if (!opts.length) return null;
  return (
    <select className={cls} aria-label={`Mức ${c.label}`} value={current} onChange={(e) => store(e.target.value)}>
      <option value="">{r.source === "Thu thập" ? "Tự đo" : "Chọn mức…"}</option>
      {opts.map((o) => (
        <option key={o.level} value={o.level}>
          {o.level}: {o.text}
        </option>
      ))}
    </select>
  );
}

export function CaseSuggestionBox({ suggestion, cases }: { suggestion: ReturnType<typeof suggestCase>; cases: CaseDef[] }) {
  const top = suggestion.candidates.slice(0, 3);
  const pick = cases.find((c) => c.code === suggestion.pick);
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="case-suggestion">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Case gợi ý:</span>
        {pick ? (
          <Badge>
            {pick.code} · {pick.name}
          </Badge>
        ) : (
          <Badge variant="outline">Cần người chọn</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
      <ul className="space-y-1 text-xs">
        {top.map((c) => (
          <li key={c.code}>
            <span className="font-medium">{c.code}</span>: khớp {c.matched.length}, lệch {c.failed.length}, chưa kiểm {c.unchecked.length}
            {c.failed.length > 0 && <span className="text-muted-foreground"> — lệch: {c.failed.join("; ")}</span>}
            {c.unchecked.length > 0 && <span className="text-muted-foreground"> — sales tự kiểm: {c.unchecked.join("; ")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StandardScoreCard({ client }: { client: Client }) {
  const { criteria, cases, results, suggestion } = useStandardScore(client);
  if (criteria.length === 0) return null;
  const byCode = new Map(results.map((r) => [r.code, r]));
  const known = results.filter((r) => r.level !== "Không rõ").length;

  return (
    <Card data-testid="standard-score">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Chấm theo Bộ chuẩn <SourceBadge source="Thu thập" />
        </CardTitle>
        <CardDescription>
          Ngưỡng lấy từ tab Tiêu chí. Đã chấm được {known}/{results.length} tiêu chí; mục chưa tự đo được thì sales nhập.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {cases.length > 0 && <CaseSuggestionBox suggestion={suggestion} cases={cases} />}
        <div className="divide-y">
          {criteria.map((c) => {
            const r = byCode.get(c.code)!;
            return (
              <div key={c.code} className="grid gap-2 py-2 text-sm sm:grid-cols-[1fr_auto_12rem] sm:items-center" data-testid={`criterion-${c.code}`}>
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{c.label}</span> <code className="text-xs text-muted-foreground">{c.code}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.value ? `${r.value} · ` : ""}
                    {r.evidence}
                  </div>
                </div>
                <Badge variant={LEVEL_VARIANT[r.level]} data-testid={`level-${c.code}`}>
                  {r.level}
                </Badge>
                <CriterionInput client={client} c={c} r={r} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
