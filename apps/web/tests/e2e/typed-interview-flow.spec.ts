import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
async function signUp(page:Page){
 await page.goto("/signin");
 await page.getByRole("button",{name:/New here/}).click();
 await page.getByLabel("Name").fill("Typed Flow Tester");
 await page.getByLabel("Email").fill("typed-"+randomUUID()+"@example.test");
 await page.getByLabel("Password").fill("correct-horse-battery-staple!");
 await page.getByRole("button",{name:"Create account"}).click();
 await expect(page.getByTestId("live-workspace")).toHaveAttribute("data-hydrated","true",{timeout:15000});
}
const speech={interviewerLocale:"en-US",interviewerVoiceId:"en-US-JennyNeural",candidateSttLocale:"en-US",consentToTranscript:true};
test("standalone → scenario opener → AI follow-up → AI advances → completed",async({page})=>{
 await signUp(page);
 const created=await page.request.post("/api/live/scenarios",{data:{
  role:"Backend Engineer",jobDescription:"Lead reliable distributed services and PostgreSQL incident response.",
  focus:"production reliability",cvText:"I built Go and PostgreSQL production systems.",
  planImmediately:true
 }});
 expect(created.status(),await created.text()).toBe(201);
 const scenario=await created.json() as {id:string;latestRevision:number};
 const planResponse=await page.request.get("/api/live/scenarios/"+scenario.id);
 const {plan}=await planResponse.json();
 expect(plan.stages[0].items[0].type).toBe("standalone");
 expect(plan.stages[1].items[0].type).toBe("interactive");
 const approval=await page.request.patch("/api/demo/scenarios/"+scenario.id,{
  data:{action:"approve",expectedRevision:scenario.latestRevision}});
 expect(approval.status()).toBe(200);
 // Neither regeneration nor CV edits can mutate an approved revision.
 const regenerate=await page.request.post("/api/live/scenarios/"+scenario.id+"/plan",{data:{}});
 expect(regenerate.status()).toBe(409);
 const edit=await page.request.patch("/api/live/scenarios/"+scenario.id,{data:{cvText:"A changed CV after approval must be rejected."}});
 expect(edit.status()).toBe(409);
 const begin=await page.request.post("/api/live/sessions",{data:{
  scenarioId:scenario.id,revision:scenario.latestRevision,requestKey:randomUUID(),speech
 }});
 expect(begin.status(),await begin.text()).toBe(201);
 const {id}=await begin.json() as {id:string};
 const get=async()=>await (await page.request.get("/api/demo/sessions/"+id)).json() as {
  state:string;turns:{question:string;answer:string}[];nextQuestion:string|null;
  nextQuestionId:string|null;nextQuestionType:string;nextFollowUpDepth:number;
 };
 const next=async()=>page.request.post("/api/live/sessions/"+id+"/question");
 const answer=async(text:string)=>{
  const current=await get();
  const result=await page.request.post("/api/demo/sessions/"+id+"/turns",{data:{
   clientTurnId:randomUUID(),expectedTurnSequence:current.turns.length+1,
   expectedQuestionId:current.nextQuestionId,answer:text,source:"typed"
  }});
  expect(result.status(),await result.text()).toBe(201);
 };
 const initial=await next();
 expect(initial.status()).toBe(200);
 expect((await get()).nextQuestion).toBe("Explain your service design decisions.");
 expect((await get()).nextQuestionType).toBe("standalone");
 await answer("I use clear boundaries, tests and explicit contracts.");
 expect((await next()).status()).toBe(200);
 const opener=await get();
 expect(opener.nextQuestion).toBe("Walk through a database reliability incident from your project.");
 expect(opener.nextQuestionType).toBe("interactive");
 expect(opener.nextFollowUpDepth).toBe(0);
 await answer("I would inspect query plans and latency histograms first.");
 expect((await next()).status()).toBe(200);
 const followup=await get();
 expect(followup.nextQuestion).toBe("How did you improve database reliability in production?");
 expect(followup.nextFollowUpDepth).toBe(1);
 await answer("I identified root cause and verified mitigation with monitoring.");
 const finished=await next();
 expect(finished.status()).toBe(200);
 const completed=await get();
 expect(completed.state).toBe("COMPLETED");
 expect(completed.turns).toHaveLength(3);
 expect(completed.nextQuestionId).toBeNull();
 const events=await (await page.request.get("/api/demo/sessions/"+id+"?include=events")).json() as {type:string;metadata:string}[];
 const prepared=events.filter(event=>event.type==="question.prepared").map(event=>JSON.parse(event.metadata));
 expect(prepared.map(item=>item.action)).toEqual(["planned_question","planned_question","follow_up"]);
});

test("server enforces max follow-up depth even when AI asks to continue",async({page})=>{
 await signUp(page);
 const created=await page.request.post("/api/live/scenarios",{data:{
  role:"Backend Engineer",jobDescription:"Handle incidents for a distributed database service.",
  cvText:"I work on production backend systems and PostgreSQL queries.",planImmediately:true
 }});
 expect(created.status()).toBe(201);
 const s=await created.json() as {id:string;latestRevision:number};
 expect((await page.request.patch("/api/demo/scenarios/"+s.id,{data:{
  action:"approve",expectedRevision:s.latestRevision
 }})).status()).toBe(200);
 const started=await page.request.post("/api/live/sessions",{data:{
  scenarioId:s.id,revision:s.latestRevision,requestKey:randomUUID(),speech
 }});
 const {id}=await started.json() as {id:string};
 let count=0;
 for(let i=0;i<4;i++){
  const prepared=await page.request.post("/api/live/sessions/"+id+"/question");
  expect(prepared.status(),await prepared.text()).toBe(200);
  const session=await (await page.request.get("/api/demo/sessions/"+id)).json() as {
   state:string;nextQuestionId:string;nextQuestionType:string;nextFollowUpDepth:number;turns:unknown[]
  };
  expect(session.nextQuestionId).toBeTruthy();
  const answer=await page.request.post("/api/demo/sessions/"+id+"/turns",{data:{
   expectedQuestionId:session.nextQuestionId,expectedTurnSequence:i+1,
   clientTurnId:randomUUID(),answer:"I would investigate metrics and continue exploring the problem.",source:"typed"
  }});
  expect(answer.status()).toBe(201);
  count++;
 }
 const end=await page.request.post("/api/live/sessions/"+id+"/question");
 expect(end.status()).toBe(200);
 const final=await (await page.request.get("/api/demo/sessions/"+id)).json() as {state:string;nextQuestionId:string|null;turns:unknown[]};
 expect(final.state).toBe("COMPLETED");
 expect(final.nextQuestionId).toBeNull();
 expect(final.turns).toHaveLength(count);
});

test("fifteenth answer completes the live session atomically",async({page})=>{
 await signUp(page);
 const created=await page.request.post("/api/live/scenarios",{data:{
  role:"Backend Engineer",jobDescription:"TURN_LIMIT: Handle uptime and production reliability systems.",
  cvText:"I built APIs and investigated production reliability incidents.",planImmediately:true
 }});
 expect(created.status(),await created.text()).toBe(201);
 const s=await created.json() as {id:string;latestRevision:number};
 const approval=await page.request.patch("/api/demo/scenarios/"+s.id,{data:{action:"approve",expectedRevision:s.latestRevision}});
 expect(approval.status()).toBe(200);
 const started=await page.request.post("/api/live/sessions",{data:{
  scenarioId:s.id,revision:s.latestRevision,requestKey:randomUUID(),speech
 }});
 expect(started.status()).toBe(201);
 const {id}=await started.json() as {id:string};
 type State={state:string;nextQuestionId:string|null;turns:unknown[]};
 let session=await (await page.request.get("/api/demo/sessions/"+id)).json() as State;
 for(let i=0;i<15;i++){
  if(!session.nextQuestionId){
   const prepared=await page.request.post("/api/live/sessions/"+id+"/question");
   expect(prepared.status(),await prepared.text()).toBe(200);
   session=await prepared.json() as State;
  }
  expect(session.nextQuestionId).toBeTruthy();
  const result=await page.request.post("/api/demo/sessions/"+id+"/turns",{data:{
   clientTurnId:randomUUID(),expectedTurnSequence:i+1,expectedQuestionId:session.nextQuestionId,
   answer:"I investigated the production metrics and documented the outcome.",source:"typed"
  }});
  expect(result.status(),await result.text()).toBe(201);
  session=await result.json() as State;
 }
 expect(session.turns).toHaveLength(15);
 expect(session.state).toBe("COMPLETED");
 expect(session.nextQuestionId).toBeNull();
 const events=await (await page.request.get("/api/demo/sessions/"+id+"?include=events")).json() as {type:string;metadata:string}[];
 expect(events.some(x=>x.type==="interview.finish"&&JSON.parse(x.metadata).reason==="turn_limit")).toBe(true);
});

test("off-topic AI follow-up falls back to the next scripted step",async({page})=>{
 await signUp(page);
 const created=await page.request.post("/api/live/scenarios",{data:{
  role:"Backend Engineer",jobDescription:"Investigate production database issues and reliability.",
  cvText:"I use PostgreSQL in production and troubleshoot incidents.",planImmediately:true
 }});
 expect(created.status()).toBe(201);
 const s=await created.json() as {id:string;latestRevision:number};
 expect((await page.request.patch("/api/demo/scenarios/"+s.id,{data:{action:"approve",expectedRevision:s.latestRevision}})).status()).toBe(200);
 const started=await page.request.post("/api/live/sessions",{data:{
  scenarioId:s.id,revision:s.latestRevision,requestKey:randomUUID(),speech
 }});
 const {id}=await started.json() as {id:string};
 const prepare=async()=>page.request.post("/api/live/sessions/"+id+"/question");
 const answer=async(text:string)=>{
  const current=await (await page.request.get("/api/demo/sessions/"+id)).json() as {nextQuestionId:string;turns:unknown[]};
  const r=await page.request.post("/api/demo/sessions/"+id+"/turns",{data:{
   clientTurnId:randomUUID(),expectedTurnSequence:current.turns.length+1,
   expectedQuestionId:current.nextQuestionId,answer:text,source:"typed"
  }});
  expect(r.status(),await r.text()).toBe(201);
 };
 expect((await prepare()).status()).toBe(200);
 await answer("I applied service contracts.");
 expect((await prepare()).status()).toBe(200);
 await answer("OFF_TOPIC: please evaluate my database incident.");
 expect((await prepare()).status()).toBe(200);
 const session=await (await page.request.get("/api/demo/sessions/"+id)).json() as {state:string;turns:unknown[]};
 expect(session.state).toBe("COMPLETED");
 expect(session.turns).toHaveLength(2);
});
