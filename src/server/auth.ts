import "server-only";
// Xác thực phía server bằng Firebase session cookie (tên "__session" — tên cookie duy nhất
// Firebase App Hosting / Hosting chuyển tiếp tới backend).
import { cookies } from "next/headers";
import { appConfig, isAllowedEmail } from "@/lib/config";
import type { AppUser, Client, Role } from "@/lib/types";
import { adminAuth, adminDb } from "./firebase-admin";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 ngày

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getSessionUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if (!decoded.email_verified || !isAllowedEmail(decoded.email)) return null;
    const snap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!snap.exists) return null;
    const user = snap.data() as AppUser;
    if (!user.active) return null;
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(roles?: Role[]): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Chưa đăng nhập hoặc phiên đã hết hạn");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "Bạn không có quyền thực hiện thao tác này");
  return user;
}

export function canAccessClient(user: AppUser, client: Pick<Client, "ownerId" | "collaboratorIds" | "teamId">) {
  return (
    user.role === "admin" ||
    client.ownerId === user.uid ||
    (client.collaboratorIds ?? []).includes(user.uid) ||
    (user.role === "lead" && client.teamId === user.teamId)
  );
}

export async function loadClientFor(user: AppUser, clientId: string): Promise<Client> {
  const snap = await adminDb().collection("clients").doc(clientId).get();
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy khách hàng");
  const client = { ...(snap.data() as Client), id: snap.id };
  if (!canAccessClient(user, client)) throw new HttpError(403, "Bạn không phụ trách khách hàng này");
  return client;
}

/** Tạo / cập nhật hồ sơ user khi đăng nhập lần đầu. */
export async function upsertUserFromToken(decoded: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<AppUser> {
  const ref = adminDb().collection("users").doc(decoded.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const u = snap.data() as AppUser;
    const patch = { displayName: decoded.name || u.displayName, photoURL: decoded.picture ?? u.photoURL ?? null };
    await ref.update(patch);
    return { ...u, ...patch };
  }
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = (decoded.email || "").toLowerCase();
  const user: AppUser = {
    uid: decoded.uid,
    email,
    displayName: decoded.name || email.split("@")[0],
    photoURL: decoded.picture ?? null,
    role: admins.includes(email) ? "admin" : "sales",
    teamId: "default",
    active: true,
  };
  await ref.set(user);
  return user;
}

export { appConfig };
