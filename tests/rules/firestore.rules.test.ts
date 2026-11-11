// Kiểm thử Firestore Security Rules trên emulator: npm run test:rules
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const tok = (email: string, verified = true) => ({ email, email_verified: verified });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-brando-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const users = [
      ["sales1", "sales1@brando.vn", "sales", "t1"],
      ["sales2", "sales2@brando.vn", "sales", "t1"],
      ["lead1", "lead1@brando.vn", "lead", "t1"],
      ["lead2", "lead2@brando.vn", "lead", "t2"],
      ["admin", "admin@brando.vn", "admin", "t9"],
      ["outsider", "x@gmail.com", "admin", "t1"],
    ];
    for (const [uid, email, role, teamId] of users) {
      await setDoc(doc(db, "users", uid), { uid, email, role, teamId, active: true, displayName: uid });
    }
    await setDoc(doc(db, "clients", "c1"), {
      name: "Khách 1",
      ownerId: "sales1",
      collaboratorIds: [],
      teamId: "t1",
      status: "research",
      sections: { company_info: {} },
      business: {},
    });
    await setDoc(doc(db, "clients", "c1", "quotes", "q1"), { version: 1 });
    await setDoc(doc(db, "catalog", "prices"), { items: [] });
  });
});

const as = (uid: string, email: string, verified = true) => env.authenticatedContext(uid, tok(email, verified)).firestore();

describe("tên miền", () => {
  it("email ngoài tên miền bị từ chối kể cả khi có user doc", async () => {
    await assertFails(getDoc(doc(as("outsider", "x@gmail.com"), "catalog", "prices")));
    await assertFails(getDoc(doc(as("outsider", "x@gmail.com"), "clients", "c1")));
  });
  it("email đuôi giả mạo bị từ chối", async () => {
    await assertFails(getDoc(doc(as("sales1", "sales1@brando.vn.evil.com"), "catalog", "prices")));
  });
  it("email chưa xác minh bị từ chối", async () => {
    await assertFails(getDoc(doc(as("sales1", "sales1@brando.vn", false), "catalog", "prices")));
  });
  it("chưa đăng nhập bị từ chối", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "catalog", "prices")));
  });
  it("email đúng tên miền đọc được catalog", async () => {
    await assertSucceeds(getDoc(doc(as("sales1", "sales1@brando.vn"), "catalog", "prices")));
  });
});

describe("phân quyền khách hàng", () => {
  it("owner đọc và sửa section theo field", async () => {
    const db = as("sales1", "sales1@brando.vn");
    await assertSucceeds(getDoc(doc(db, "clients", "c1")));
    await assertSucceeds(updateDoc(doc(db, "clients", "c1"), { "sections.company_info.description": "x", updatedAt: 1 }));
  });
  it("sales khác không đọc được", async () => {
    await assertFails(getDoc(doc(as("sales2", "sales2@brando.vn"), "clients", "c1")));
  });
  it("lead cùng nhóm đọc được, lead khác nhóm thì không", async () => {
    await assertSucceeds(getDoc(doc(as("lead1", "lead1@brando.vn"), "clients", "c1")));
    await assertFails(getDoc(doc(as("lead2", "lead2@brando.vn"), "clients", "c1")));
  });
  it("lead query theo teamId", async () => {
    const db = as("lead1", "lead1@brando.vn");
    await assertSucceeds(getDocs(query(collection(db, "clients"), where("teamId", "==", "t1"))));
  });
  it("admin đọc mọi khách", async () => {
    await assertSucceeds(getDocs(collection(as("admin", "admin@brando.vn"), "clients")));
  });
  it("collaborator được mời thì đọc được", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "clients", "c1"), { collaboratorIds: ["sales2"] }));
    await assertSucceeds(getDoc(doc(as("sales2", "sales2@brando.vn"), "clients", "c1")));
  });
  it("client không được tự đổi owner / collaborators / tạo khách", async () => {
    const db = as("sales1", "sales1@brando.vn");
    await assertFails(updateDoc(doc(db, "clients", "c1"), { ownerId: "sales2" }));
    await assertFails(updateDoc(doc(db, "clients", "c1"), { collaboratorIds: ["sales2"] }));
    await assertFails(setDoc(doc(db, "clients", "c2"), { ownerId: "sales1" }));
  });
  it("báo giá, nhận định, catalog, users chỉ server ghi", async () => {
    const db = as("admin", "admin@brando.vn");
    await assertFails(setDoc(doc(db, "clients", "c1", "quotes", "q2"), { version: 2 }));
    await assertFails(setDoc(doc(db, "clients", "c1", "assessment", "current"), {}));
    await assertFails(setDoc(doc(db, "catalog", "prices"), { items: [] }));
    await assertFails(updateDoc(doc(as("sales1", "sales1@brando.vn"), "users", "sales1"), { role: "admin" }));
  });
  it("activity chỉ ghi dưới tên chính mình", async () => {
    const db = as("sales1", "sales1@brando.vn");
    await assertSucceeds(addDoc(collection(db, "clients", "c1", "activity"), { uid: "sales1", action: "x" }));
    await assertFails(addDoc(collection(db, "clients", "c1", "activity"), { uid: "sales2", action: "x" }));
  });
  it("user bị khoá mất quyền", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users", "sales1"), { active: false }));
    await assertFails(getDoc(doc(as("sales1", "sales1@brando.vn"), "clients", "c1")));
  });
});
