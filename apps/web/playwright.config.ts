import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
const testDatabase = join(tmpdir(), `interview-playwright-${process.pid}.db`);
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
      command: "pnpm db:migrate && pnpm dev",
      url: "http://localhost:3000/signin",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DATABASE_URL:testDatabase,DEMO_MODE: "true",ENABLE_PROVIDER_TESTS:"true",ENABLE_LOCAL_AI_CLI:"false",OPENAI_API_KEY:"ci-mock-key",AI_MODEL:"ci-mock-model",LLM_BASE_URL:"http://localhost:8787/v1" }
    }
  ],
});
