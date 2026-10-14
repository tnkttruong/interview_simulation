import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", browserName: "chromium", trace: "on-first-retry" },
  webServer: [
    {
      command: "node tests/fixtures/mock-llm.mjs",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: "pnpm dev",
      url: "http://localhost:3000/signin",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DEMO_MODE: "true",OPENAI_API_KEY:"ci-mock-key",AI_MODEL:"ci-mock-model",LLM_BASE_URL:"http://localhost:8787/v1" }
    }
  ],
});
