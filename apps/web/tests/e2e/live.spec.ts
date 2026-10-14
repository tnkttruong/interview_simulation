import {expect,test} from "@playwright/test";
test("live API denies unauthenticated model calls and speech tokens",async({request})=>{
 const create=await request.post("/api/live/scenarios",{data:{
   role:"Backend Engineer",jobDescription:"Build distributed applications",cvText:"Experienced in APIs and databases"
 }});
 expect(create.status()).toBe(401);
 expect((await request.post("/api/live/sessions/00000000-0000-4000-8000-000000000000/question")).status()).toBe(401);
 expect((await request.get("/api/live/speech/voices")).status()).toBe(401);
 expect((await request.post("/api/live/speech/preview",{data:{interviewerLocale:"en-US",voiceId:"en-US-JennyNeural"}})).status()).toBe(401);
 expect((await request.post("/api/live/speech/token",{data:{sessionId:"00000000-0000-4000-8000-000000000000"}})).status()).toBe(401);
});
test("live page requires authentication",async({page})=>{
 await page.goto("/live");
 await expect(page).toHaveURL(/\/signin/);
});
test("offline workspace links to live interview",async({page})=>{
 await page.goto("/signin");
 await page.getByRole("button",{name:/New here/}).click();
 await page.getByLabel("Name").fill("P1 Test Candidate");
 await page.getByLabel("Email").fill("live-"+Date.now()+"@example.test");
 await page.getByLabel("Password").fill("correct-horse-battery-staple!");
 await page.getByRole("button",{name:"Create account"}).click();
 await expect(page.getByRole("link",{name:/AI Interview/})).toBeVisible();
 await page.getByRole("link",{name:/AI Interview/}).click();
 await expect(page.getByRole("heading",{name:"Practice a real interview with AI"})).toBeVisible();
 await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true");
 await page.getByRole("button",{name:"3. preflight"}).click();
 await expect(page.getByLabel("AI interviewer language")).toBeVisible();
 await expect(page.getByRole("button",{name:/Start AI meeting/})).toBeDisabled();
});
