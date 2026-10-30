import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";

async function signUp(page:import("@playwright/test").Page){
 await page.goto("/signin");
 await page.getByRole("button",{name:/New here/}).click();
 await page.getByLabel("Name").fill("Review Regression");
 await page.getByLabel("Email").fill("review-"+randomUUID()+"@example.test");
 await page.getByLabel("Password").fill("correct-horse-battery-staple!");
 await page.getByRole("button",{name:"Create account"}).click();
 await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true",{timeout:15_000});
}
const speech={interviewerLocale:"en-US",interviewerVoiceId:"en-US-JennyNeural",
 candidateSttLocale:"en-US",consentToTranscript:true};
async function counts(page:import("@playwright/test").Page):Promise<Record<string,number>>{
 return (await page.request.get("http://127.0.0.1:8787/stats")).json();
}
const scenario={role:"Backend Engineer",jobDescription:"Build and own reliable backend services.",
 cvText:"I built cloud services with Postgres and handled real production incidents.",
 focus:"Concurrency and database performance",planImmediately:true};

test("concurrent AI creation is charged once, demo cannot revise live plan, listing and audit carry live mode",async({page})=>{
 await signUp(page);
 const beforeCreate=await counts(page);
 const responses=await Promise.all(Array.from({length:8},()=>page.request.post("/api/live/scenarios",{data:scenario})));
 expect(responses.filter(r=>r.status()===201).length).toBe(1);
 expect(responses.filter(r=>r.status()===409).length).toBe(7);
 expect((await counts(page)).plan-beforeCreate.plan).toBe(1);
 const created=await responses.find(r=>r.status()===201)!.json() as {id:string;latestRevision:number};
 const demoRevise=await page.request.patch("/api/demo/scenarios/"+created.id,{
  data:{action:"revise",notes:"attempt to break AI plan",expectedRevision:1}});
 expect(demoRevise.status()).toBe(400);
 const plan=await page.request.get("/api/live/scenarios/"+created.id);
 expect(plan.status()).toBe(200);
 const planned=(await plan.json()) as {scenario:{latestRevision:number};plan:{stages:{questions:string[];suggestedAnswers?:string[]}[]}};
 expect(planned.scenario.latestRevision).toBe(1);
 expect(planned.plan.stages[0]?.suggestedAnswers?.length).toBe(planned.plan.stages[0]?.questions.length);
 const beforeRevise=await counts(page);
 const revisions=await Promise.all(Array.from({length:5},()=>
  page.request.post("/api/live/scenarios/"+created.id+"/revise",{
   data:{feedback:"Focus on measurable database reliability",expectedRevision:1}})));
 expect(revisions.filter(r=>r.status()===200).length).toBe(1);
 expect(revisions.filter(r=>r.status()===409).length).toBe(4);
 expect((await counts(page)).revise-beforeRevise.revise).toBe(1);
 const approval=await page.request.patch("/api/demo/scenarios/"+created.id,{
  data:{action:"approve",expectedRevision:2}});
 expect(approval.status()).toBe(200);
 const started=await page.request.post("/api/live/sessions",{
  data:{scenarioId:created.id,revision:2,requestKey:randomUUID(),speech}});
 expect(started.status()).toBe(201);
 const session=await started.json() as {id:string};
 const listing=await (await page.request.get("/api/demo/sessions?limit=50")).json() as {items:{id:string;mode:string}[]};
 expect(listing.items.find(x=>x.id===session.id)?.mode).toBe("live");
 const evidence=await (await page.request.get("/api/demo/sessions/"+session.id+"?include=events")).json() as {type:string;metadata:string}[];
 const preflight=evidence.find(x=>x.type==="preflight.client_reported");
 expect(JSON.parse(preflight!.metadata).mode).toBe("live");
 const beforeQuestion=await counts(page);
 const q=await Promise.all(Array.from({length:6},()=>page.request.post("/api/live/sessions/"+session.id+"/question")));
 expect(q.every(r=>[200,409].includes(r.status()))).toBe(true);
 expect(q.some(r=>r.status()===200)).toBe(true);
 expect((await counts(page)).question-beforeQuestion.question).toBe(0);
 const current=await (await page.request.get("/api/demo/sessions/"+session.id)).json();
 expect(current.nextQuestionId).toBeTruthy();
 expect(current.nextQuestionType).toBe("standalone");
 expect(current.nextSuggestedAnswer).toContain("service boundaries");
 const beforeHint=await counts(page);
 const h=await Promise.all(Array.from({length:5},()=>page.request.post("/api/live/sessions/"+session.id+"/hint")));
 expect(h.every(r=>[200,409].includes(r.status()))).toBe(true);
 expect(h.some(r=>r.status()===200)).toBe(true);
 expect((await counts(page)).hint-beforeHint.hint).toBe(1);
});

test("maximum accepted JD and CV fit structured provider input without truncation",async({page})=>{
 await signUp(page);
 const res=await page.request.post("/api/live/scenarios",{data:{
  role:"Systems Architect",jobDescription:"Design reliable systems. "+"J".repeat(18000),
  cvText:"I owned backend systems. "+"C".repeat(28900),focus:"architecture",planImmediately:true}});
 expect(res.status(),await res.text()).toBe(201);
 const created=await res.json() as {id:string};
 const saved=await page.request.get("/api/live/scenarios/"+created.id);
 expect(saved.status()).toBe(200);
});
