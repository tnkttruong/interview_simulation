import { expect, test } from "@playwright/test";

test("diagnostic page and endpoints require an account", async ({ page, request }) => {
  expect((await request.get("/api/me/provider-tests")).status()).toBe(401);
  expect((await request.post("/api/me/provider-tests/cli", { data: { provider: "codex_cli", model: "gpt-5" } })).status()).toBe(401);
  expect((await request.post("/api/me/provider-tests/azure/token")).status()).toBe(401);
  await page.goto("/settings/test");
  await expect(page).toHaveURL(/\/signin/);
});

test("test dashboard exposes readiness but does not leak credentials or run absent providers", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("Provider Test User");
  await page.getByLabel("Email").fill("provider-test-" + Date.now() + "@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button", { name: "Create account" }).click();
  // Wait for Better Auth navigation; do not abort the in-flight redirect with page.goto.
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true");
  await page.goto("/settings");
  await page.getByRole("link", { name: /Test providers/ }).click();
  await expect(page.getByRole("heading", { name: "Test AI and Azure providers" })).toBeVisible();
  await expect(page.getByText("Diagnostics enabled")).toBeVisible();
  await expect(page.getByLabel("Codex CLI model")).toBeVisible();
  await expect(page.getByLabel("Agy CLI model")).toBeVisible();
  const status = await page.request.get("/api/me/provider-tests");
  expect(status.status()).toBe(200);
  const data = await status.json();
  expect(data.enabled).toBe(true);
  expect(data.azure.configured).toBe(false);
  expect(JSON.stringify(data)).not.toContain("ci-mock-key");
  expect(JSON.stringify(data)).not.toContain("AZURE_SPEECH_KEY");
  const invalid = await page.request.post("/api/me/provider-tests/cli", { data: { provider: "codex_cli", model: "; whoami" } });
  expect(invalid.status()).toBe(400);
  const missingCli = await page.request.post("/api/me/provider-tests/cli", { data: { provider: "codex_cli", model: "gpt-5" } });
  expect(missingCli.status()).toBe(400);
  expect((await missingCli.json()).error).toMatch(/not installed|disabled/);
  const missingAzure = await page.request.post("/api/me/provider-tests/azure/token");
  expect(missingAzure.status()).toBe(400);
  expect((await missingAzure.json()).error).toMatch(/not configured/);
});
