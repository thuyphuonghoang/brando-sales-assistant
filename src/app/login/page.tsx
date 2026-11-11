"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { appConfig } from "@/lib/config";
import { usingEmulators } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signInWithGoogle, signInEmulator } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/clients";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(`sales1@${appConfig.allowedDomain}`);
  const [name, setName] = useState("Sales Một");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.replace(next);
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("popup-closed") ? "Bạn đã đóng cửa sổ đăng nhập" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BRANDO Sales Assistant</CardTitle>
          <CardDescription>Đăng nhập bằng tài khoản Google @{appConfig.allowedDomain}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" disabled={busy} onClick={() => run(signInWithGoogle)}>
            Đăng nhập với Google
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="login-error">
              {error}
            </p>
          )}
          {usingEmulators && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">Đăng nhập thử (chỉ khi chạy emulator)</p>
              <Label htmlFor="emu-email">Email</Label>
              <Input id="emu-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Label htmlFor="emu-name">Tên hiển thị</Label>
              <Input id="emu-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => signInEmulator(email, name))}>
                Đăng nhập thử
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
