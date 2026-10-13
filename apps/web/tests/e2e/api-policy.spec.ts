import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const speech = (locale: "en-US" | "vi-VN" = "en-US") => ({
  interviewerLocale: locale,
  interviewerVoiceId: locale === "vi-VN" ? "vi-VN-HoaiMyNeural" : "en-US-JennyNeural",
  candidateSttLocale: "en-US",
  consentToTranscript: true
});

async function register(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("Policy Test User");
  await page.getByLabel("Email").fill(`policy-${randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery-staple!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("workspace-shell")).toHaveAttribute("data-hydrated", "true");
}

async function scenarioFor(page: Page) {
  const created = await page.request.post("/api/demo/scenarios", {
    data: { role: "Backend Engineer", jobDescription: "Build reliable and scalable backend services", focus: "Databases" }
  });
  expect(created.status()).toBe(201);
  const scenario = await created.json() as { id: string; latestRevision: number };
  const approved = await page.request.patch(`/api/demo/scenarios/${scenario.id}`, {
    data: { action: "approve", expectedRevision: scenario.latestRevision }
  });
  expect(approved.ok()).toBeTruthy();
  return scenario;
}

async function sessionFor(page: Page, scenarioId: string, locale: "en-US" | "vi-VN" = "en-US") {
  const started = await page.request.post("/api/demo/sessions", {
    data: { scenarioId, revision: 1, requestKey: randomUUID(), speech: speech(locale) }
  });
  expect(started.status()).toBe(201);
  return await started.json() as { id: string; state: string; version: number; nextQuestion: string | null; turns: unknown[] };
}

test("requires approval, marks demo preflight accurately, and protects cross-user data", async ({ page, browser }) => {
  await register(page);
  const unapproved = await page.request.post("/api/demo/scenarios", {
    data: { role: "Systems Developer", jobDescription: "Develop and maintain distributed services", focus: "" }
  });
  expect(unapproved.status()).toBe(201);
  const unapprovedId = (await unapproved.json()).id as string;
  const refused = await page.request.post("/api/demo/sessions", {
    data: { scenarioId: unapprovedId, revision: 1, requestKey: randomUUID(), speech: speech() }
  });
  expect(refused.status()).toBe(400);

  const scenario = await scenarioFor(page);
  const session = await sessionFor(page, scenario.id, "vi-VN");
  expect(session.nextQuestion).toContain("Bạn có thể");
  const evidence = await page.request.get(`/api/demo/sessions/${session.id}?include=events`);
  expect(evidence.ok()).toBeTruthy();
  const eventTypes = (await evidence.json() as { type: string }[]).map(e => e.type);
  expect(eventTypes).toContain("preflight.demo_skipped");
  expect(eventTypes).not.toContain("preflight.passed");

  const otherContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const otherPage = await otherContext.newPage();
    await register(otherPage);
    for (const url of [
      `/api/demo/scenarios/${scenario.id}`,
      `/api/demo/sessions/${session.id}`,
      `/api/demo/sessions/${session.id}/turns`,
      `/api/demo/sessions/${session.id}?include=events`
    ]) {
      const response = await otherPage.request.get(url);
      expect(response.status(), url).toBe(404);
    }
    const edit = await otherPage.request.patch(`/api/demo/sessions/${session.id}`, {
      data: { action: "finish", expectedVersion: session.version }
    });
    expect(edit.status()).toBe(404);
  } finally {
    await otherContext.close();
  }
});

test("idempotency conflicts, forged STT, stale versions and paused answers are rejected", async ({ page }) => {
  await register(page);
  const scenario = await scenarioFor(page);
  const key = randomUUID();
  const startBody = { scenarioId: scenario.id, revision: 1, requestKey: key, speech: speech() };
  const first = await page.request.post("/api/demo/sessions", { data: startBody });
  const retry = await page.request.post("/api/demo/sessions", { data: startBody });
  expect(first.status()).toBe(201);
  expect(retry.status()).toBe(201);
  const session = await first.json() as { id: string; version: number };
  expect((await retry.json()).id).toBe(session.id);
  expect((await page.request.post("/api/demo/sessions", {
    data: { ...startBody, speech: speech("vi-VN") }
  })).status()).toBe(409);

  const answerUrl = `/api/demo/sessions/${session.id}/turns`;
  const data = { clientTurnId: randomUUID(), answer: "I optimized slow queries.", source: "typed" };
  expect((await page.request.post(answerUrl, { data })).status()).toBe(201);
  expect((await page.request.post(answerUrl, { data })).status()).toBe(201);
  expect((await page.request.post(answerUrl, {
    data: { ...data, answer: "Different answer using the same key" }
  })).status()).toBe(409);
  expect((await (await page.request.get(answerUrl)).json() as unknown[])).toHaveLength(1);

  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), answer: "Fake STT", source: "recognized", originalStt: "fake" }
  })).status()).toBe(400);
  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), answer: "Forged origin", source: "typed", originalStt: "fake" }
  })).status()).toBe(400);

  const url = `/api/demo/sessions/${session.id}`;
  const pause = await page.request.patch(url, { data: { action: "pause", expectedVersion: session.version } });
  expect(pause.ok()).toBeTruthy();
  expect((await page.request.patch(url, {
    data: { action: "finish", expectedVersion: session.version }
  })).status()).toBe(409);
  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), answer: "Not while paused" }
  })).status()).toBe(400);
  const paused = await pause.json() as { version: number };
  expect((await page.request.patch(url, {
    data: { action: "resume", expectedVersion: paused.version }
  })).ok()).toBeTruthy();
});

test("15 turns are persisted and the API stops offering unanswerable prompts", async ({ page }) => {
  await register(page);
  const scenario = await scenarioFor(page);
  const session = await sessionFor(page, scenario.id, "vi-VN");
  const url = `/api/demo/sessions/${session.id}/turns`;
  for (let n = 0; n < 15; n++) {
    const response = await page.request.post(url, {
      data: { clientTurnId: randomUUID(), answer: `Câu trả lời số ${n + 1}` }
    });
    expect(response.status(), `turn ${n + 1}`).toBe(201);
    const body = await response.json() as { nextQuestion: string | null; turns: {question:string}[] };
    expect(body.turns[n].question).toMatch(/[À-ỹ]/);
    expect(body.nextQuestion === null).toBe(n === 14);
  }
  expect((await page.request.post(url, {
    data: { clientTurnId: randomUUID(), answer: "Over limit" }
  })).status()).toBe(400);
  expect((await (await page.request.get(url)).json() as unknown[])).toHaveLength(15);
});
