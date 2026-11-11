import { expect, type Browser, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

export const PROJECT = "demo-brando";
if (!getApps().length) initializeApp({ projectId: PROJECT });
export const db = getFirestore();
export const auth = getAuth();

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Đăng nhập bằng form "Đăng nhập thử" (chỉ hiện khi chạy emulator). */
export async function login(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Tên hiển thị").fill(name);
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await page.waitForURL("**/clients", { timeout: 30_000 });
  await expect(page.getByTestId("current-user")).toHaveText(name);
}

export async function newUserPage(browser: Browser, email: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email, name);
  return page;
}

export async function syncAsAdmin(browser: Browser) {
  const page = await newUserPage(browser, "admin@brando.vn", "Quản Trị");
  const res = await page.request.post("/api/admin/sync");
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.context().close();
}

export async function createClient(page: Page, name: string, industry = "F&B") {
  const res = await page.request.post("/api/clients", {
    data: { name, industry, inputs: { mapsUrl: "https://maps.google.com/?q=test" } },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

export async function researchAndAssess(page: Page, id: string) {
  const r1 = await page.request.post(`/api/clients/${id}/research`);
  expect(r1.ok(), await r1.text()).toBeTruthy();
  const r2 = await page.request.post(`/api/clients/${id}/assessment`);
  expect(r2.ok(), await r2.text()).toBeTruthy();
}

export async function uidOf(email: string) {
  return (await auth.getUserByEmail(email)).uid;
}
