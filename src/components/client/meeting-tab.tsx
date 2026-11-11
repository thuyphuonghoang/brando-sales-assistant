"use client";
import { useState } from "react";
import { addDoc, collection, doc, orderBy, query, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { firebase } from "@/lib/firebase/client";
import type { Client, MeetingNote } from "@/lib/types";
import { useQuery } from "@/hooks/firestore";
import type { FieldLock } from "@/hooks/collab";
import { useAuth } from "@/components/auth-provider";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "./research-tab";

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  feedback: "",
  realObjections: "",
  customerTier4T: "" as MeetingNote["customerTier4T"],
  decisionMaker: "",
  nextStep: "",
  nextDate: "",
};

export function MeetingTab({ client, locks }: { client: Client; locks: Record<string, FieldLock> }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const meetings = useQuery<MeetingNote>(
    user ? () => query(collection(firebase().db, "clients", client.id, "meetings"), orderBy("createdAt", "desc")) : null,
    `${client.id}-meetings-${user?.uid}`,
  ).data;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { db } = firebase();
      await addDoc(collection(db, "clients", client.id, "meetings"), {
        ...form,
        authorId: user.uid,
        authorName: user.displayName,
        createdAt: Date.now(),
      });
      if (client.status === "research" || client.status === "assessed") {
        await updateDoc(doc(db, "clients", client.id), { status: "meeting", updatedAt: Date.now() });
      }
      await addDoc(collection(db, "clients", client.id, "activity"), {
        uid: user.uid,
        name: user.displayName,
        action: "Ghi chú buổi gặp",
        field: form.date,
        at: Date.now(),
      });
      setForm(EMPTY);
      toast.success("Đã lưu ghi chú buổi gặp");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const f = (k: keyof typeof EMPTY) => ({
    id: `m-${k}`,
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Ghi chú buổi gặp <SourceBadge source="Sales nhập" />
          </CardTitle>
          <CardDescription>Có thể điền ngay trong lúc trình bày cho khách.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="m-date">Ngày gặp</Label>
              <Input type="date" {...f("date")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-customerTier4T">Khách đang ở tầng 4T nào?</Label>
              <select
                id="m-customerTier4T"
                className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                value={form.customerTier4T}
                onChange={(e) => setForm({ ...form, customerTier4T: e.target.value as MeetingNote["customerTier4T"] })}
              >
                <option value="">Không rõ</option>
                {["Tác dụng", "Tương xứng", "Tin tưởng", "Tăng trưởng"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="m-feedback">Phản hồi của khách</Label>
              <Textarea {...f("feedback")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="m-realObjections">Phản đối thực tế</Label>
              <Textarea {...f("realObjections")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-decisionMaker">Người quyết định (chức danh)</Label>
              <Input {...f("decisionMaker")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="m-nextDate">Ngày hẹn tiếp theo</Label>
              <Input type="date" {...f("nextDate")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="m-nextStep">Bước tiếp theo</Label>
              <Input {...f("nextStep")} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Lưu ghi chú
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {meetings.map((m) => (
        <Card key={m.id} size="sm">
          <CardHeader>
            <CardTitle className="text-sm">
              Buổi gặp {m.date} — {m.authorName}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p><span className="text-muted-foreground">Phản hồi:</span> {m.feedback || "Không rõ"}</p>
            <p><span className="text-muted-foreground">Phản đối thực tế:</span> {m.realObjections || "Không rõ"}</p>
            <p><span className="text-muted-foreground">Tầng 4T:</span> {m.customerTier4T || "Không rõ"}</p>
            <p><span className="text-muted-foreground">Người quyết định:</span> {m.decisionMaker || "Không rõ"}</p>
            <p><span className="text-muted-foreground">Bước tiếp theo:</span> {m.nextStep || "Không rõ"} {m.nextDate && `(hẹn ${m.nextDate})`}</p>
          </CardContent>
        </Card>
      ))}

      <SectionCard client={client} section="meeting_notes" locks={locks} />
    </div>
  );
}
