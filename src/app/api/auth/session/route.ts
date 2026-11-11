import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/config";
import { adminAuth } from "@/server/firebase-admin";
import { HttpError, SESSION_COOKIE, SESSION_MAX_AGE_MS, upsertUserFromToken } from "@/server/auth";
import { handle } from "@/server/http";

const Body = z.object({ idToken: z.string().min(10) });

// Đổi Firebase ID token lấy session cookie. Kiểm tra tên miền ở server (lớp thứ 2 sau client).
export const POST = handle(async (req: Request) => {
  const { idToken } = Body.parse(await req.json());
  const decoded = await adminAuth().verifyIdToken(idToken);
  if (!decoded.email_verified || !isAllowedEmail(decoded.email)) {
    throw new HttpError(403, "Chỉ tài khoản email công ty được phép đăng nhập");
  }
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
    throw new HttpError(401, "Phiên đăng nhập đã cũ, vui lòng đăng nhập lại");
  }
  const user = await upsertUserFromToken(decoded);
  if (!user.active) throw new HttpError(403, "Tài khoản đã bị khoá, liên hệ admin");
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, cookie, {
    maxAge: SESSION_MAX_AGE_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return res;
});

export const DELETE = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
});
