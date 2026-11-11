"use client";
// Field cộng tác: lưu theo field, khoá mềm 60 giây, hiện "X đang sửa".
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { appConfig } from "@/lib/config";
import { lockId, useFieldActions, type FieldLock } from "@/hooks/collab";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SourceBadge } from "./source-badge";

interface Props {
  clientId: string;
  path: string; // vd "sections.company_info.description"
  label: string;
  value: string | number | null | undefined;
  locks: Record<string, FieldLock>;
  multiline?: boolean;
  type?: "text" | "number";
  placeholder?: string;
  hint?: string;
}

export function EditableField({ clientId, path, label, value, locks, multiline, type = "text", placeholder, hint }: Props) {
  const { user } = useAuth();
  const { acquire, release, save } = useFieldActions(clientId);
  const remote = value == null ? "" : String(value);
  const [draft, setDraft] = useState(remote);
  const [prevRemote, setPrevRemote] = useState(remote);
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const renewAt = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(null);

  // Đồng bộ giá trị người khác vừa lưu khi mình không đang sửa field này.
  if (remote !== prevRemote && !focused) {
    setPrevRemote(remote);
    setDraft(remote);
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const lock = locks[lockId(path)];
  const lockedByOther = !!lock && lock.uid !== user?.uid && lock.expiresAt > now;
  const id = `f-${lockId(path)}`;

  const persist = async (v: string) => {
    if (v === (lastSaved.current ?? remote)) return;
    lastSaved.current = v;
    const out = type === "number" ? (v.trim() === "" ? null : Number(v.replace(/[^\d]/g, ""))) : v;
    try {
      await save(path, out, label);
    } catch (e) {
      toast.error(`Không lưu được "${label}": ${(e as Error).message}`);
    }
  };

  const onChange = (v: string) => {
    setDraft(v);
    if (Date.now() > renewAt.current) {
      renewAt.current = Date.now() + appConfig.fieldLockMs / 3;
      acquire(path).catch(() => {});
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(v), 800);
  };

  const onFocus = () => {
    setFocused(true);
    lastSaved.current = remote;
    renewAt.current = Date.now() + appConfig.fieldLockMs / 3;
    acquire(path).catch(() => {});
  };

  const onBlur = () => {
    setFocused(false);
    setPrevRemote(remote); // giữ bản của mình, chờ snapshot xác nhận
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persist(draft);
    release(path);
  };

  const common = {
    id,
    value: draft,
    placeholder,
    disabled: lockedByOther,
    onFocus,
    onBlur,
    "data-field": path,
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          {lockedByOther && (
            <span className="flex items-center gap-1 text-xs text-amber-600" data-testid="lock-indicator">
              <Lock className="size-3" /> {lock.name} đang sửa
              <Button
                size="xs"
                variant="ghost"
                className="h-5 px-1 text-xs underline"
                onClick={() => {
                  if (confirm(`${lock.name} đang sửa mục này. Bạn vẫn muốn sửa?`)) acquire(path);
                }}
              >
                Vẫn sửa
              </Button>
            </span>
          )}
          <SourceBadge source="Sales nhập" />
        </div>
      </div>
      {multiline ? (
        <Textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} inputMode={type === "number" ? "numeric" : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
