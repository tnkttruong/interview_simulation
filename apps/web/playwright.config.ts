import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", browserName: "chromium", trace: "on-first-retry" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/signin",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DEMO_MODE: "true" }
  },
});
