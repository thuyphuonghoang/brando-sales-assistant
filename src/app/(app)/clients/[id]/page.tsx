"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CLIENT_STATUS_LABELS, type AssessmentDoc, type Client } from "@/lib/types";
import { useDoc } from "@/hooks/firestore";
import { useLocks } from "@/hooks/collab";
import { ActivityLog, MembersPanel, PresenceBar } from "@/components/collab-widgets";
import { ResearchTab } from "@/components/client/research-tab";
import { AssessmentTab } from "@/components/client/assessment-tab";
import { MeetingTab } from "@/components/client/meeting-tab";
import { ServicesTab, type Selection } from "@/components/client/services-tab";
import { QuotesTab } from "@/components/client/quotes-tab";
import { IndustrySelect } from "@/components/client/industry-select";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  ["research", "Research"],
  ["assessment", "Nhận định"],
  ["meeting", "Ghi chú gặp"],
  ["services", "Dịch vụ"],
  ["quotes", "Báo giá"],
] as const;

export default function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") ?? "research";
  const { data: client, loading, error } = useDoc<Client>(`clients/${id}`);
  const { data: assessment } = useDoc<AssessmentDoc>(`clients/${id}/assessment/current`);
  const locks = useLocks(id);
  const [selection, setSelection] = useState<Selection | null>(null);

  if (loading) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (error || !client) {
    return (
      <p className="text-sm text-destructive">
        {error?.includes("permission") ? "Bạn không có quyền xem khách hàng này." : "Không tìm thấy khách hàng."}
      </p>
    );
  }

  const setTab = (t: string) => router.replace(`/clients/${id}?tab=${t}`, { scroll: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/clients" className="text-xs text-muted-foreground hover:underline">
            ← Khách hàng
          </Link>
          <h1 className="text-2xl font-semibold" data-testid="client-name">
            {client.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <IndustrySelect client={client} />
            <Badge variant="outline">{CLIENT_STATUS_LABELS[client.status]}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PresenceBar clientId={id} />
          <Link href={`/present/${id}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Chế độ trình bày
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="overflow-x-auto">
            <TabsList>
              {TABS.map(([k, label]) => (
                <TabsTrigger key={k} value={k}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="research">
            <ResearchTab client={client} locks={locks} />
          </TabsContent>
          <TabsContent value="assessment">
            <AssessmentTab client={client} assessment={assessment} />
          </TabsContent>
          <TabsContent value="meeting">
            <MeetingTab client={client} locks={locks} />
          </TabsContent>
          <TabsContent value="services">
            <ServicesTab
              client={client}
              assessment={assessment}
              onUse={(s) => {
                setSelection(s);
                setTab("quotes");
              }}
            />
          </TabsContent>
          <TabsContent value="quotes">
            <QuotesTab client={client} assessment={assessment} selection={selection} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Thành viên</CardTitle>
            </CardHeader>
            <CardContent>
              <MembersPanel client={client} />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Hoạt động</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              <ActivityLog clientId={id} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
