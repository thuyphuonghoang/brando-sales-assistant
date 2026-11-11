"use client";
// Presence, bình luận theo section (@nhắc tên), activity log, người phụ trách / hỗ trợ.
import { useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { firebase } from "@/lib/firebase/client";
import { SECTION_LABELS, type AppUser, type Client, type SectionKey } from "@/lib/types";
import { useQuery, useUsers } from "@/hooks/firestore";
import { usePresence } from "@/hooks/collab";
import { useAuth } from "@/components/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(-2)
    .join("")
    .toUpperCase();
}

export function UserAvatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  return (
    <Avatar className={className} title={name}>
      {photo ? <AvatarImage src={photo} alt={name} /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function PresenceBar({ clientId }: { clientId: string }) {
  const people = usePresence(clientId);
  return (
    <div className="flex items-center gap-2" data-testid="presence">
      <span className="hidden text-xs text-muted-foreground sm:inline">Đang xem:</span>
      <div className="flex -space-x-2">
        {people.map((p) => (
          <UserAvatar key={p.uid} name={p.name} photo={p.photoURL} className="size-7 ring-2 ring-background" />
        ))}
      </div>
    </div>
  );
}

interface Comment {
  id: string;
  section: SectionKey;
  text: string;
  authorName: string;
  authorPhoto: string | null;
  createdAt: number;
}

export function CommentThread({ clientId, section }: { clientId: string; section: SectionKey }) {
  const { user } = useAuth();
  const users = useUsers();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const comments = useQuery<Comment>(
    user
      ? () =>
          query(
            collection(firebase().db, "clients", clientId, "comments"),
            where("section", "==", section),
            orderBy("createdAt", "asc"),
          )
      : null,
    `${clientId}-${section}-${user?.uid}`,
  ).data;

  const mentionQuery = text.match(/@([^\s@]*)$/)?.[1];
  const suggestions = useMemo(
    () =>
      mentionQuery === undefined
        ? []
        : users
            .filter((u) => u.uid !== user?.uid && u.displayName.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 5),
    [mentionQuery, users, user],
  );

  const submit = async () => {
    if (!text.trim()) return;
    const mentions = users.filter((u) => text.includes(`@${u.displayName}`)).map((u) => u.uid);
    setBusy(true);
    try {
      await api(`/api/clients/${clientId}/comments`, "POST", { section, text, mentions });
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-2">
      <button className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen(!open)}>
        Bình luận ({comments.length}) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <UserAvatar name={c.authorName} photo={c.authorPhoto} className="size-6" />
              <div>
                <span className="font-medium">{c.authorName}</span>{" "}
                <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString("vi-VN")}</span>
                <p className="whitespace-pre-wrap">{c.text}</p>
              </div>
            </div>
          ))}
          <div className="relative flex gap-2">
            <Input
              value={text}
              placeholder={`Bình luận về ${SECTION_LABELS[section].toLowerCase()} — gõ @ để nhắc tên`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && suggestions.length === 0 && submit()}
            />
            <Button size="sm" onClick={submit} disabled={busy}>
              Gửi
            </Button>
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 w-64 rounded-md border bg-popover p-1 shadow">
                {suggestions.map((u) => (
                  <button
                    key={u.uid}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => setText(text.replace(/@([^\s@]*)$/, `@${u.displayName} `))}
                  >
                    {u.displayName} <span className="text-xs text-muted-foreground">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Activity {
  id: string;
  name: string;
  action: string;
  field: string | null;
  at: number;
}

export function ActivityLog({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const items = useQuery<Activity>(
    user ? () => query(collection(firebase().db, "clients", clientId, "activity"), orderBy("at", "desc"), limit(40)) : null,
    `${clientId}-activity-${user?.uid}`,
  ).data;
  return (
    <ol className="space-y-1.5 text-sm" data-testid="activity-log">
      {items.length === 0 && <li className="text-muted-foreground">Chưa có hoạt động.</li>}
      {items.map((a) => (
        <li key={a.id}>
          <span className="font-medium">{a.name}</span> {a.action.toLowerCase()}
          {a.field ? <> “{a.field}”</> : null}{" "}
          <span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString("vi-VN")}</span>
        </li>
      ))}
    </ol>
  );
}

export function MembersPanel({ client }: { client: Client }) {
  const { user } = useAuth();
  const users = useUsers();
  const [adding, setAdding] = useState("");
  const canManage = user && (user.role !== "sales" || client.ownerId === user.uid);
  const canChangeOwner = user && user.role !== "sales";
  const byId = new Map(users.map((u) => [u.uid, u]));

  const patch = async (body: { ownerId?: string; collaboratorIds?: string[] }) => {
    try {
      await api(`/api/clients/${client.id}/members`, "PATCH", body);
      toast.success("Đã cập nhật");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const candidates = users.filter((u: AppUser) => u.active && u.uid !== client.ownerId && !client.collaboratorIds.includes(u.uid));

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">Người phụ trách</div>
        {canChangeOwner ? (
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5"
            value={client.ownerId}
            onChange={(e) => patch({ ownerId: e.target.value })}
          >
            {users.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.displayName}
              </option>
            ))}
          </select>
        ) : (
          <div className="font-medium">{client.ownerName}</div>
        )}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Người hỗ trợ</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {client.collaboratorIds.length === 0 && <span className="text-muted-foreground">Chưa có</span>}
          {client.collaboratorIds.map((uid) => (
            <span key={uid} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              {byId.get(uid)?.displayName ?? uid}
              {canManage && (
                <button
                  aria-label="Bỏ"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => patch({ collaboratorIds: client.collaboratorIds.filter((x) => x !== uid) })}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && candidates.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
            >
              <option value="">Mời người hỗ trợ…</option>
              {candidates.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!adding}
              onClick={() => {
                patch({ collaboratorIds: [...client.collaboratorIds, adding] });
                setAdding("");
              }}
            >
              Mời
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
