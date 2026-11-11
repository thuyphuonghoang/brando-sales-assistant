import { defineConfig, devices } from "@playwright/test";

// Chạy bằng: npm run test:e2e (tự bật Auth + Firestore emulator).
// Google APIs chạy ở chế độ mock (GOOGLE_MODE=mock).
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-brando",
      NEXT_PUBLIC_ALLOWED_DOMAIN: "brando.vn",
      GOOGLE_MODE: "mock",
      ROOT_FOLDER_ID: "ROOT_TEST",
      ADMIN_EMAILS: "admin@brando.vn",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      APP_BASE_URL: `http://localhost:${PORT}`,
    },
  },
});
