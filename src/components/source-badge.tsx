import type { SourceLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<SourceLabel, string> = {
  "Thu thập": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "AI nhận định": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "Sales nhập": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

/** Nhãn nguồn bắt buộc cho mọi thông tin: Thu thập / AI nhận định / Sales nhập. */
export function SourceBadge({ source, className }: { source: SourceLabel; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", STYLES[source], className)}>
      {source}
    </span>
  );
}
