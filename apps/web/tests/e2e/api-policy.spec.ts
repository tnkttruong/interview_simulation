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
  const data = { clientTurnId: randomUUID(), expectedTurnSequence: 1, answer: "I optimized slow queries.", source: "typed" };
  expect((await page.request.post(answerUrl, { data })).status()).toBe(201);
  expect((await page.request.post(answerUrl, { data })).status()).toBe(201);
  expect((await page.request.post(answerUrl, {
    data: { ...data, answer: "Different answer using the same key" }
  })).status()).toBe(409);
  expect((await (await page.request.get(answerUrl)).json() as unknown[])).toHaveLength(1);

  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), expectedTurnSequence: 2, answer: "Fake STT", source: "recognized", originalStt: "fake" }
  })).status()).toBe(400);
  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), expectedTurnSequence: 2, answer: "Forged origin", source: "typed", originalStt: "fake" }
  })).status()).toBe(400);

  const url = `/api/demo/sessions/${session.id}`;
  const pause = await page.request.patch(url, { data: { action: "pause", expectedVersion: session.version } });
  expect(pause.ok()).toBeTruthy();
  expect((await page.request.patch(url, {
    data: { action: "finish", expectedVersion: session.version }
  })).status()).toBe(409);
  expect((await page.request.post(answerUrl, {
    data: { clientTurnId: randomUUID(), expectedTurnSequence: 2, answer: "Not while paused" }
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
      data: { clientTurnId: randomUUID(), expectedTurnSequence: n + 1, answer: `Câu trả lời số ${n + 1}` }
    });
    expect(response.status(), `turn ${n + 1}`).toBe(201);
    const body = await response.json() as { nextQuestion: string | null; turns: {question:string}[] };
    expect(body.turns[n].question).toMatch(/[À-ỹ]/);
    expect(body.nextQuestion === null).toBe(n === 14);
  }
  expect((await page.request.post(url, {
    data: { clientTurnId: randomUUID(), expectedTurnSequence: 15, answer: "Over limit" }
  })).status()).toBe(400);
  expect((await (await page.request.get(url)).json() as unknown[])).toHaveLength(15);
});

test("rejects stale-question submissions while retaining identical retries", async ({ page }) => {
  await register(page);
  const scenario = await scenarioFor(page);
  const session = await sessionFor(page, scenario.id);
  const endpoint = `/api/demo/sessions/${session.id}/turns`;
  const first = {clientTurnId: randomUUID(), expectedTurnSequence:1, answer:"Q1 answer"};
  const stale = {clientTurnId: randomUUID(), expectedTurnSequence:1, answer:"Stale tab also answered Q1"};
  expect((await page.request.post(endpoint,{data:first})).status()).toBe(201);
  expect((await page.request.post(endpoint,{data:stale})).status()).toBe(409);
  expect((await page.request.post(endpoint,{data:first})).status()).toBe(201);
  expect((await page.request.post(endpoint,{data:{...first,expectedTurnSequence:2}})).status()).toBe(409);
  const turns=await (await page.request.get(endpoint)).json() as {answer:string;sequence:number}[];
  expect(turns).toHaveLength(1);
  expect(turns[0]).toMatchObject({answer:"Q1 answer",sequence:1});
});

test("scoped pagination omits sensitive JD and enforces creation rate limits", async ({ page }) => {
  await register(page);
  await scenarioFor(page);
  const result = await page.request.get("/api/demo/scenarios?limit=1&offset=0");
  expect(result.ok()).toBeTruthy();
  expect(result.headers()["x-request-id"]).toBeTruthy();
  const data = await result.json() as {items:Record<string,unknown>[];total:number;nextOffset:number|null};
  expect(data.total).toBe(1);
  expect(data.items).toHaveLength(1);
  expect(data.items[0]).not.toHaveProperty("jobDescription");
  expect((await page.request.get("/api/demo/scenarios?limit=1000")).status()).toBe(400);
  expect((await page.request.get("/api/demo/sessions?offset=NaN")).status()).toBe(400);
  for(let i=1;i<12;i++){
    const response=await page.request.post("/api/demo/scenarios",{data:{
      role:"Backend Engineer",jobDescription:"Build reliable scalable services",focus:""
    }});
    expect(response.status()).toBe(201);
  }
  expect((await page.request.post("/api/demo/scenarios",{data:{
    role:"Backend Engineer",jobDescription:"Build reliable scalable services",focus:""
  }})).status()).toBe(429);
  const second=(await (await page.request.get("/api/demo/scenarios?limit=1&offset=1")).json())
    as {items:unknown[];total:number;nextOffset:number|null};
  expect(second.items).toHaveLength(1);
  expect(second.total).toBe(12);
  expect(second.nextOffset).toBe(2);
});

test("interrupted sessions can resume using stored version", async ({ page }) => {
  await register(page);
  const scenario=await scenarioFor(page);
  const session=await sessionFor(page,scenario.id);
  const endpoint=`/api/demo/sessions/${session.id}`;
  const interrupted=await page.request.patch(endpoint,{data:{action:"connectionLost",expectedVersion:session.version}});
  expect(interrupted.ok()).toBeTruthy();
  const snapshot=await interrupted.json() as {state:string;version:number};
  expect(snapshot.state).toBe("INTERRUPTED");
  const resumed=await page.request.patch(endpoint,{data:{action:"resume",expectedVersion:snapshot.version}});
  expect(resumed.ok()).toBeTruthy();
  expect((await resumed.json()).state).toBe("IN_PROGRESS");
});
