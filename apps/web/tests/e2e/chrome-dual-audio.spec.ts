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
  await expect(page.getByRole("button", { name: "Start Azure STT", exact: true })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: /▶ Play/ }).first()).toBeEnabled();
  await expect(page.getByText("Goroutines and channels")).toBeVisible();
  const response = await page.request.post("/api/me/provider-tests/audio-samples", { data: { id: "golang-en" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/configure azure/i);
});

test("Play generates Azure audio once per sample per page, and reload clears in-memory cache", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("Audio Cache User");
  await page.getByLabel("Email").fill("audio-cache-" + Date.now() + "@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated", "true");

  let calls = 0;
  const wave = Buffer.alloc(44 + 16000);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(16000, 24);
  wave.writeUInt32LE(32000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(wave.length - 44, 40);
  await page.route("**/api/me/provider-tests/audio-samples", async route => {
    calls++;
    await route.fulfill({ status: 200, contentType: "audio/wav", body: wave });
  });
  await page.goto("/settings/audio-samples");
  await page.getByRole("button", { name: "▶ Play" }).first().click();
  await expect(page.getByRole("button", { name: "↻ Replay (cached)" })).toHaveCount(1);
  expect(calls).toBe(1);

  await page.getByRole("button", { name: "↻ Replay (cached)" }).click();
  expect(calls).toBe(1);

  await page.getByRole("button", { name: "▶ Play" }).first().click();
  await expect(page.getByRole("button", { name: "↻ Replay (cached)" })).toHaveCount(2);
  expect(calls).toBe(2);

  await page.reload();
  await expect(page.getByRole("button", { name: "↻ Replay (cached)" })).toHaveCount(0);
  await page.getByRole("button", { name: "▶ Play" }).first().click();
  await expect(page.getByRole("button", { name: "↻ Replay (cached)" })).toHaveCount(1);
  expect(calls).toBe(3);
});
