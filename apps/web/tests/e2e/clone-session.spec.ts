import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";

async function register(page:Page){
 await page.goto("/signin");
 await page.getByRole("button",{name:/New here/}).click();
 await page.getByLabel("Name").fill("Meeting Clone Tester");
 await page.getByLabel("Email").fill("clone-"+randomUUID()+"@example.test");
 await page.getByLabel("Password").fill("correct-horse-battery-staple!");
 await page.getByRole("button",{name:"Create account"}).click();
 await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true",{timeout:15_000});
}

test("clone a past meeting's original JD/CV into a separate editable review",async({page,browser})=>{
 await register(page);
 const input={
  role:"Senior Backend Engineer",
  jobDescription:"Build scalable distributed backend systems and mentor junior developers.",
  focus:"SQL reliability, incident response",
  cvText:"I maintained PostgreSQL production databases and implemented fault-tolerant APIs.",
  cvFilename:"candidate-original.pdf",
  planImmediately:true
 };
 const created=await page.request.post("/api/live/scenarios",{data:input});
 expect(created.status(),await created.text()).toBe(201);
 const scenario=await created.json() as {id:string;latestRevision:number};
 const approved=await page.request.patch("/api/demo/scenarios/"+scenario.id,{
  data:{action:"approve",expectedRevision:scenario.latestRevision}});
 expect(approved.status(),await approved.text()).toBe(200);
 const speech={interviewerLocale:"en-US",interviewerVoiceId:"en-US-JennyNeural",
  candidateSttLocale:"en-US",consentToTranscript:true};
 const started=await page.request.post("/api/live/sessions",{data:{
  scenarioId:scenario.id,revision:scenario.latestRevision,requestKey:randomUUID(),speech}});
 expect(started.status(),await started.text()).toBe(201);
 const session=await started.json() as {id:string};
 const uri="/api/live/sessions/"+session.id+"/clone-source";

 const initial=await page.request.get(uri);
 expect(initial.status()).toBe(200);
 expect(initial.headers()["cache-control"]).toContain("no-store");
 expect(await initial.json()).toMatchObject({
  role:input.role,jobDescription:input.jobDescription,focus:input.focus,
  cvText:input.cvText,cvFilename:input.cvFilename,source:"snapshot"
 });

 // Approved revisions are immutable: edits to the original JD/CV must be rejected.
 // Cloning must retain the original meeting snapshot.
 const changed=await page.request.patch("/api/live/scenarios/"+scenario.id,{data:{
  role:"Changed role",jobDescription:"A completely different job description for another position.",
  cvText:"A replacement CV for another position and another role."
 }});
 expect(changed.status(),await changed.text()).toBe(409);
 expect(await (await page.request.get(uri)).json()).toMatchObject({
  jobDescription:input.jobDescription,cvText:input.cvText,source:"snapshot"
 });

 // Source is protected by the session owner's authenticated account.
 const second=await browser.newContext({baseURL:"http://localhost:3000"});
 try{
  const another=await second.newPage();
  await register(another);
  expect((await another.request.get(uri)).status()).toBe(404);
 }finally{await second.close();}
 expect((await page.request.get(uri)).status()).toBe(200);

 await page.reload();
 await expect(page.getByRole("heading",{name:"Prior live sessions"})).toBeVisible();
 await page.getByRole("button",{name:/Clone JD & CV from meeting/}).first().click();
 await expect(page.getByRole("heading",{name:/2. Scenario details/})).toBeVisible();
 await expect(page.getByText("Edit scenario",{exact:true})).toBeVisible();
 await expect(page.getByRole("textbox",{name:"Role",exact:true})).toHaveValue(input.role);
 await expect(page.getByRole("textbox",{name:"Job description",exact:true})).toHaveValue(input.jobDescription);
 await expect(page.getByRole("textbox",{name:"CV text",exact:true})).toHaveValue(input.cvText);
 await expect(page.getByRole("textbox",{name:"Tech stack / focus"})).toHaveValue(input.focus);
 await expect(page.getByText(/New review created from the meeting's original JD and CV/)).toBeVisible();

 const clonedId=new URL(page.url()).searchParams.get("scenarioId");
 expect(clonedId).toBeTruthy();
 expect(clonedId).not.toBe(scenario.id);
 const clone=await (await page.request.get("/api/live/scenarios/"+clonedId)).json();
 expect(clone.scenario.id).toBe(clonedId);
 expect(clone.scenario.latestRevision).toBe(1);
 expect(clone.plan).toBeNull();
 expect(clone.cvText).toBe(input.cvText);
 expect(clone.cvFilename).toBe(input.cvFilename);
 expect((await page.request.get("/api/demo/sessions/"+session.id)).status()).toBe(200);
});

test("clone-source requires login",async({request})=>{
 const response=await request.get("/api/live/sessions/00000000-0000-4000-8000-000000000000/clone-source");
 expect(response.status()).toBe(401);
});
