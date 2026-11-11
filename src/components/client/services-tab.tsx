"use client";
import { useMemo, useState } from "react";
import { budgetAdvice, buildPackages, servicesForProblem } from "@/lib/packages";
import { formatVnd } from "@/lib/pricing";
import type { AssessmentDoc, Client, PackageOption } from "@/lib/types";
import { useCatalog } from "@/hooks/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface Selection {
  packageName: string;
  items: { code: string; quantity: number }[];
}

export function ServicesTab({
  client,
  assessment,
  onUse,
}: {
  client: Client;
  assessment: AssessmentDoc | null;
  onUse: (s: Selection) => void;
}) {
  const { prices, rules } = useCatalog();
  const priceMap = useMemo(() => new Map(prices.map((p) => [p.code, p])), [prices]);
  const a = assessment ? (assessment.edited ?? assessment.ai) : null;
  const packages = useMemo(
    () => (a ? buildPackages(a.problems, client.industry, rules, priceMap) : []),
    [a, client.industry, rules, priceMap],
  );
  const advice = budgetAdvice(client.business?.budget, packages);
  const [custom, setCustom] = useState<Selection | null>(null);
  const [addCode, setAddCode] = useState("");

  const start = (p: PackageOption) => setCustom({ packageName: p.tier, items: p.items.map((i) => ({ ...i })) });
  const total = custom ? custom.items.reduce((s, i) => s + (priceMap.get(i.code)?.price ?? 0) * i.quantity, 0) : 0;

  if (!a) {
    return <p className="text-sm text-muted-foreground">Cần có nhận định (3 vấn đề ưu tiên) trước khi gợi ý dịch vụ.</p>;
  }

  return (
    <div className="space-y-4">
      {!advice.ok && (
        <Alert variant="destructive" data-testid="budget-warning">
          <AlertTitle>{advice.message}</AlertTitle>
          <AlertDescription>
            <p>Ngân sách khách: {formatVnd(client.business.budget ?? 0)}.</p>
            <ul className="mt-1 list-disc pl-5">
              {advice.suggestions?.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dịch vụ gợi ý theo vấn đề</CardTitle>
          <CardDescription>Theo bảng quy tắc (RULES_SHEET).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {a.problems.map((p) => (
            <div key={p.problem_code + p.title}>
              <span className="font-medium">{p.title}</span>{" "}
              <code className="text-xs text-muted-foreground">{p.problem_code}</code>
              <div className="mt-1 flex flex-wrap gap-1">
                {servicesForProblem(rules, client.industry, p.problem_code).map((c) => (
                  <Badge key={c} variant="secondary">
                    {priceMap.get(c)?.name ?? c}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {packages.map((p) => (
          <Card key={p.tier} data-testid={`package-${p.tier}`} className={p.tier === "Khuyến nghị" ? "ring-2 ring-primary" : ""}>
            <CardHeader>
              <CardTitle>{p.tier}</CardTitle>
              <CardDescription>{formatVnd(p.estimatedTotal)} (chưa VAT)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc pl-5">
                {p.items.map((i) => (
                  <li key={i.code}>{priceMap.get(i.code)?.name}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Giải quyết: {p.solves.join("; ")}</p>
              <Button size="sm" variant="outline" onClick={() => start(p)}>
                Chọn & tuỳ chỉnh
              </Button>
            </CardContent>
          </Card>
        ))}
        {packages.length === 0 && <p className="text-sm text-muted-foreground">Không có dịch vụ nào khớp quy tắc cho các vấn đề này.</p>}
      </div>

      {custom && (
        <Card>
          <CardHeader>
            <CardTitle>Phương án: {custom.packageName}</CardTitle>
            <CardDescription>Thêm / bớt / đổi số lượng. Giá chính thức được tính lại ở server khi tạo báo giá.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {custom.items.map((i, idx) => {
              const p = priceMap.get(i.code);
              return (
                <div key={i.code} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-40 flex-1">{p?.name ?? i.code}</span>
                  <span className="text-muted-foreground">{p ? `${formatVnd(p.price)}/${p.unit}` : ""}</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    aria-label={`Số lượng ${p?.name}`}
                    value={i.quantity}
                    onChange={(e) => {
                      const items = [...custom.items];
                      items[idx] = { ...i, quantity: Math.max(1, Number(e.target.value) || 1) };
                      setCustom({ ...custom, packageName: custom.packageName, items });
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setCustom({ ...custom, items: custom.items.filter((_, j) => j !== idx) })}>
                    Bỏ
                  </Button>
                </div>
              );
            })}
            <div className="flex gap-2">
              <select className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" value={addCode} onChange={(e) => setAddCode(e.target.value)}>
                <option value="">Thêm dịch vụ…</option>
                {prices
                  .filter((p) => !custom.items.some((i) => i.code === p.code))
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.group} · {p.name} — {formatVnd(p.price)}
                    </option>
                  ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!addCode}
                onClick={() => {
                  setCustom({ ...custom, items: [...custom.items, { code: addCode, quantity: 1 }] });
                  setAddCode("");
                }}
              >
                Thêm
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <span className="font-medium">Tạm tính: {formatVnd(total)} (chưa VAT)</span>
              <Button disabled={custom.items.length === 0} onClick={() => onUse(custom)} data-testid="use-selection">
                Lập báo giá →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
