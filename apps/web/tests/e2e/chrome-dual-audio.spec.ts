import { expect, test } from "@playwright/test";

test("Chrome dual-audio diagnostic requires authentication", async ({ page }) => {
  await page.goto("/settings/audio-test");
  await expect(page).toHaveURL(/\/signin/);
});

test("dual-audio diagnostic displays independent microphone and meeting-tab controls", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("Audio Test User");
  await page.getByLabel("Email").fill("audio-test-" + Date.now() + "@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated", "true");

  await page.goto("/settings/test");
  await page.getByRole("link", { name: /Dual audio capture test/ }).click();
  await expect(page).toHaveURL(/\/settings\/audio-test/);
  await expect(page.getByRole("heading", { name: "Microphone + meeting tab audio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Candidate · Microphone" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interviewer · Chrome Tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect microphone" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share meeting tab audio" })).toBeVisible();
  await expect(page.getByLabel("Candidate · Microphone input level")).toHaveAttribute("value", "0");
  await expect(page.getByLabel("Interviewer · Chrome Tab input level")).toHaveAttribute("value", "0");
  await expect(page.getByRole("button", { name: "Start Azure STT" })).toBeDisabled();
  await expect(page.getByText("PCM frames sent:")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Open the sample audio player in a new tab/ })).toHaveAttribute("href", "/settings/audio-samples");
  await expect(page.getByText("No speech recognized yet.")).toHaveCount(2);
});

test("audio samples page requires login and API rejects unauthenticated requests", async ({ page, request }) => {
  await page.goto("/settings/audio-samples");
  await expect(page).toHaveURL(/\/signin/);
  const api = await request.post("/api/me/provider-tests/audio-samples", { data: { id: "golang-en" } });
  expect(api.status()).toBe(401);
});

test("sample audio page shows fixed interview clips without starting paid Azure calls", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("Sample Audio User");
  await page.getByLabel("Email").fill("sample-audio-" + Date.now() + "@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated", "true");

  await page.goto("/settings/audio-samples");
  await expect(page.getByRole("heading", { name: "Sample audio player" })).toBeVisible();
  await expect(page.getByRole("button", { name: /▶ Play/ })).toHaveCount(6);
  await expect(page.getByText("Goroutines and channels")).toBeVisible();
  const response = await page.request.post("/api/me/provider-tests/audio-samples", { data: { id: "golang-en" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/configure azure/i);
});
