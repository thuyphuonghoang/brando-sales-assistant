import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";
import { PricingError } from "@/lib/pricing";

/** Bọc route handler: chuyển lỗi thành JSON { error } với mã HTTP phù hợp. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof PricingError) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Dữ liệu không hợp lệ", issues: e.issues }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
    }
  };
}
