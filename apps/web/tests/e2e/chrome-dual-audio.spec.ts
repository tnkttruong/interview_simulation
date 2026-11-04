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
  await expect(page.getByText("No speech recognized yet.")).toHaveCount(2);
});
