// Tiêu chí nghiệm thu (SPEC mục 9). Chạy: npm run test:e2e
import { expect, test } from "@playwright/test";
import { formatVnd } from "@/lib/pricing";
import { allowedNumberSet, findDisallowedNumbers } from "@/lib/stats-guard";
import type { AssessmentDoc, PriceItem, Quote, StatItem } from "@/lib/types";
import { priceRows } from "@/server/fixtures/sheets";
import { createClient, db, login, newUserPage, researchAndAssess, syncAsAdmin, uidOf, unique } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await db.collection("_mock").doc("sheets").delete();
  await syncAsAdmin(browser);
});

test("1. Hai người sửa 2 section khác nhau → cùng thấy thay đổi < 3 giây, không mất dữ liệu", async ({ browser }) => {
  const a = await newUserPage(browser, "sales1@brando.vn", "Sales Một");
  const b = await newUserPage(browser, "sales2@brando.vn", "Sales Hai");
  const id = await createClient(a, unique("Cộng tác"));
  const invite = await a.request.patch(`/api/clients/${id}/members`, { data: { collaboratorIds: [await uidOf("sales2@brando.vn")] } });
  expect(invite.ok()).toBeTruthy();

  await Promise.all([a.goto(`/clients/${id}`), b.goto(`/clients/${id}`)]);
  await expect(a.getByTestId("presence").locator("[data-slot=avatar]")).toHaveCount(2);

  const fA = '[data-field="sections.company_info.description"]';
  const fB = '[data-field="sections.online_presence.website_notes"]';
  const textA = "Chuỗi cà phê, khách văn phòng";
  const textB = "Website chậm trên điện thoại";
  await a.locator(fA).fill(textA);
  await b.locator(fB).fill(textB);
  // B thấy A đang sửa (khoá mềm)
  await expect(b.locator(`[data-section="company_info"]`).getByTestId("lock-indicator")).toContainText("Sales Một đang sửa");
  await Promise.all([a.locator(fA).blur(), b.locator(fB).blur()]);

  const t0 = Date.now();
  await Promise.all([
    expect(b.locator(fA)).toHaveValue(textA, { timeout: 3_000 }),
    expect(a.locator(fB)).toHaveValue(textB, { timeout: 3_000 }),
  ]);
  expect(Date.now() - t0).toBeLessThan(3_000);

  const saved = (await db.collection("clients").doc(id).get()).data()!;
  expect(saved.sections.company_info.description).toBe(textA);
  expect(saved.sections.online_presence.website_notes).toBe(textB);
  await expect(a.getByTestId("activity-log")).toContainText("Sales Hai");
});

test("2. Email ngoài tên miền bị từ chối (client + server + Security Rules)", async ({ page, request }) => {
  // Client
  await page.goto("/login");
  await page.getByLabel("Email").fill("nguoila@gmail.com");
  await page.getByLabel("Tên hiển thị").fill("Người Lạ");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByTestId("login-error")).toContainText("@brando.vn");
  expect(page.url()).toContain("/login");

  // Lấy ID token thật của email ngoài tên miền từ Auth emulator (bỏ qua kiểm tra phía client)
  const fake = JSON.stringify({ sub: "outsider-1", email: "nguoila@gmail.com", email_verified: true });
  const idp = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key",
    {
      data: {
        postBody: `id_token=${encodeURIComponent(fake)}&providerId=google.com`,
        requestUri: "http://localhost",
        returnSecureToken: true,
      },
    },
  );
  const { idToken } = (await idp.json()) as { idToken: string };
  expect(idToken).toBeTruthy();

  // Server
  const session = await request.post("/api/auth/session", { data: { idToken } });
  expect(session.status()).toBe(403);

  // Security Rules
  const fs = await request.get(
    "http://127.0.0.1:8080/v1/projects/demo-brando/databases/(default)/documents/catalog/prices",
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  expect(fs.status()).toBe(403);

  // Trang nội bộ chuyển về đăng nhập
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("Research → Nhận định", () => {
  let id: string;
  test("3. Research 1 doanh nghiệp → có bảng chấm điểm theo ngành + 3 đối thủ", async ({ page }) => {
    await login(page, "sales1@brando.vn", "Sales Một");
    id = await createClient(page, unique("Quán Phở Mẫu"));
    await db.collection("clients").doc(id).update({ "inputs.website": "quanphomau.vn" });
    await page.goto(`/clients/${id}`);
    await page.getByTestId("run-research").click();
    await expect(page.getByTestId("competitor-row").first()).toBeVisible({ timeout: 20_000 });
    expect(await page.getByTestId("competitor-row").count()).toBeGreaterThanOrEqual(3);
    // Khám website tự động (mock): thẻ kết quả hiện ra với điểm mobile.
    await expect(page.getByTestId("website-audit")).toContainText("48");

    // Đổi ngành ngay trên hồ sơ (đi qua server, ghi activity) rồi đổi lại.
    await page.getByTestId("client-industry").selectOption("Giáo dục");
    await expect.poll(async () => (await db.collection("clients").doc(id).get()).get("industry")).toBe("Giáo dục");
    await page.getByTestId("client-industry").selectOption("F&B");
    await expect.poll(async () => (await db.collection("clients").doc(id).get()).get("industry")).toBe("F&B");

    // Chấm theo Bộ chuẩn: MAP-REV tự đo (mock 12 review → Yếu), sales chọn khu vực → case gợi ý M1.
    await expect(page.getByTestId("level-MAP-REV")).toHaveText("Yếu");
    await page.getByLabel("Chọn Khu vực kinh doanh và tệp khách local").selectOption("khu dân cư local");
    await expect(page.getByTestId("case-suggestion")).toContainText("M1");

    await page.getByRole("tab", { name: "Nhận định" }).click();
    await page.getByTestId("run-assessment").click();
    const rows = page.getByTestId("scorecard").locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const industries = (await db.collection("catalog").doc("industries").get()).get("items") as { name: string; checklist: unknown[] }[];
    expect(await rows.count()).toBe(industries.find((i) => i.name === "F&B")!.checklist.length);
    await expect(page.getByTestId("problem")).toHaveCount(3);
  });

  test("4. Không có số liệu nào ngoài STATS_SHEET trong nhận định", async ({ page }) => {
    await login(page, "sales1@brando.vn", "Sales Một");
    const stats = (await db.collection("catalog").doc("stats").get()).get("items") as StatItem[];
    const allowed = allowedNumberSet(stats);
    const a = ((await db.collection("clients").doc(id).collection("assessment").doc("current").get()).data() as AssessmentDoc).ai;
    const texts = [
      ...a.scorecard.map((s) => s.evidence),
      a.competitorComparison,
      a.funnelReason,
      ...a.problems.flatMap((p) => [p.title, p.detail]),
      ...a.opportunities,
      ...Object.values(a.pitch4T),
      ...a.objections.flatMap((o) => [o.objection, o.response]),
    ];
    for (const t of texts) expect(findDisallowedNumbers(t, allowed), t).toEqual([]);
    // Bản mock cố tình chèn "300%" — phải bị loại.
    expect(a.removedSentences).toBeGreaterThan(0);
    for (const s of a.stats) expect(stats.some((x) => x.id === s.statId)).toBe(true);

    await page.goto(`/clients/${id}?tab=assessment`);
    await expect(page.getByTestId("assessment")).toBeVisible();
    await expect(page.getByTestId("assessment")).not.toContainText("300%");
  });
});

test.describe("Báo giá", () => {
  let id: string;
  let clientName: string;
  let q1: Quote;

  test.afterAll(async ({ browser }) => {
    await db.collection("_mock").doc("sheets").delete();
    await syncAsAdmin(browser);
  });

  test("5. Giá báo giá khớp 100% bảng giá lúc tạo; sửa Sheet sau đó không đổi báo giá cũ", async ({ page, browser }) => {
    await login(page, "sales1@brando.vn", "Sales Một");
    clientName = unique("Nha Khoa Mẫu");
    id = await createClient(page, clientName, "F&B");
    await researchAndAssess(page, id);

    await page.goto(`/clients/${id}?tab=services`);
    await page.getByTestId("package-Khuyến nghị").getByRole("button", { name: "Chọn & tuỳ chỉnh" }).click();
    await page.getByTestId("use-selection").click();
    await page.getByTestId("create-quote").click();
    await expect(page.getByTestId("quote-card")).toHaveCount(1, { timeout: 15_000 });

    const priceDoc = async () => new Map(((await db.collection("catalog").doc("prices").get()).get("items") as PriceItem[]).map((p) => [p.code, p]));
    const prices = await priceDoc();
    const qs = await db.collection("clients").doc(id).collection("quotes").get();
    q1 = { ...(qs.docs[0].data() as Quote), id: qs.docs[0].id };
    expect(q1.lines.length).toBeGreaterThan(0);
    for (const l of q1.lines) {
      expect(l.unitPrice).toBe(prices.get(l.code)!.price);
      expect(l.amount).toBe(l.unitPrice * l.quantity);
    }
    expect(q1.totals.subtotal).toBe(q1.lines.reduce((s, l) => s + l.amount, 0));
    expect(q1.lines.some((l) => l.code === "GBP-OPT")).toBe(true);

    // Admin sửa giá trên "Sheet" rồi đồng bộ lại
    const changed = priceRows.map((r) => (r[0] === "GBP-OPT" ? [...r.slice(0, 5), "9.999.000", r[6]] : r));
    await db.collection("_mock").doc("sheets").set({ priceRows: JSON.stringify(changed) });
    await syncAsAdmin(browser);
    expect((await priceDoc()).get("GBP-OPT")!.price).toBe(9_999_000);

    const again = (await db.collection("clients").doc(id).collection("quotes").doc(q1.id).get()).data() as Quote;
    expect(again.lines).toEqual(q1.lines);
    expect(again.totals).toEqual(q1.totals);

    // Báo giá mới dùng giá mới
    const res = await page.request.post(`/api/clients/${id}/quotes`, { data: { items: [{ code: "GBP-OPT", quantity: 1 }] } });
    expect(res.ok()).toBeTruthy();
    const q2 = (await res.json()) as { version: number; totals: Quote["totals"] };
    expect(q2.version).toBe(2);
    expect(q2.totals.subtotal).toBe(9_999_000);
  });

  test("6. PDF đúng mẫu, lưu đúng thư mục Drive", async ({ page }) => {
    await login(page, "sales1@brando.vn", "Sales Một");
    await page.goto(`/clients/${id}?tab=quotes`);
    const card = page.locator(`[data-testid=quote-card][data-version="1"]`);
    await card.getByTestId("make-pdf").click();
    await expect(card.getByTestId("pdf-link")).toBeVisible({ timeout: 15_000 });

    const files = await db.collection("_mock").doc("drive").collection("files").where("quoteId", "==", q1.id).get();
    expect(files.size).toBe(1);
    const f = files.docs[0].data();
    expect(f.folder).toBe(`ROOT_TEST/${clientName}`);
    expect(f.path).toBe(`ROOT_TEST/${clientName}/Bao gia ${clientName} v1.pdf`);
    // Dữ liệu điền vào mẫu khớp báo giá
    expect(f.placeholders.client_name).toBe(clientName);
    expect(f.placeholders.total).toBe(formatVnd(q1.totals.total));
    expect(f.placeholders.quote_number).toBe("v1");
    expect(f.lines).toHaveLength(q1.lines.length);
    for (const key of ["client_name", "issue_date", "valid_until", "owner_name", "subtotal", "vat_amount", "total", "payment_terms", "timeline"]) {
      expect(f.placeholders[key], key).toBeTruthy();
    }

    const quote = (await db.collection("clients").doc(id).collection("quotes").doc(q1.id).get()).data() as Quote & { drivePath: string };
    expect(quote.drivePath).toBe(f.path);
    await card.getByTestId("pdf-link").click();
  });
});

test("7. /present không chứa ghi chú nội bộ (kiểm tra HTML trả về)", async ({ page }) => {
  await login(page, "sales1@brando.vn", "Sales Một");
  const name = unique("Present Test");
  const id = await createClient(page, name);
  await researchAndAssess(page, id);

  const SECRET = "GHICHU-NOIBO-XYZ";
  const BUDGET = 987654321;
  await db.collection("clients").doc(id).update({
    "sections.company_info.description": SECRET,
    "sections.meeting_notes.summary": "TOMTAT-GAP-XYZ",
    "business.budget": BUDGET,
    "business.decisionMaker": "NGUOI-QD-XYZ",
  });
  await page.request.post(`/api/clients/${id}/comments`, { data: { section: "company_info", text: "BINHLUAN-XYZ" } });
  await db.collection("clients").doc(id).collection("meetings").add({ feedback: "PHANHOI-XYZ", authorId: "x", createdAt: Date.now() });
  // Đánh dấu câu nói 4T và phản đối bằng chuỗi ASCII để kiểm tra chắc chắn (tránh khác biệt mã hoá Unicode)
  await db.collection("clients").doc(id).collection("assessment").doc("current").update({
    "ai.pitch4T": { tacDung: "CAUNOI1-XYZ", tuongXung: "CAUNOI2-XYZ", tinTuong: "CAUNOI3-XYZ", tangTruong: "CAUNOI4-XYZ" },
    "ai.objections": [{ objection: "PHANDOI-XYZ", response: "XULY-XYZ" }],
  });

  const res = await page.request.get(`/present/${id}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(name);

  const a = ((await db.collection("clients").doc(id).collection("assessment").doc("current").get()).data() as AssessmentDoc).ai;
  const forbidden = [
    SECRET,
    "TOMTAT-GAP-XYZ",
    String(BUDGET),
    "NGUOI-QD-XYZ",
    "BINHLUAN-XYZ",
    "PHANHOI-XYZ",
    ...Object.values(a.pitch4T),
    ...a.objections.flatMap((o) => [o.objection, o.response]),
  ];
  for (const s of forbidden) expect(html, `HTML lộ: ${s}`).not.toContain(s);
  // Nội dung được phép trình bày
  expect(html).toContain(a.problems[0].title);
});

test("8. Catalog trống (emulator vừa khởi động lại) → tự đồng bộ khi người dùng đăng nhập", async ({ page }) => {
  for (const d of ["prices", "rules", "industries", "stats", "meta"]) await db.collection("catalog").doc(d).delete();
  await login(page, "sales1@brando.vn", "Sales Một"); // sales thường, không phải admin
  await page.getByRole("button", { name: "+ Khách hàng mới" }).click();
  await expect(page.locator("#c-industry option", { hasText: "F&B" })).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText("Chưa có danh sách ngành")).toHaveCount(0);
});
