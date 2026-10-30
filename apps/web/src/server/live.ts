import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { DomainError, isRelevantScenarioFollowUp, maxDemoTurns, nextFlowPosition, validateSpeechConfig } from "@interview/core";
import { db } from "./db/client";
import { interviewSessions,interviewTurns,liveHints,liveQuestions,liveSessionSources,scenarioPlans,scenarioRevisions,scenarios,workflowEvents } from "./db/schema";
import { changeScenario,changeSession,createScenario,createSession,getScenario,getSession } from "./demo";
import {decideScenarioFollowUp,hintSchema,nextInterviewQuestion,planScenario,planSchema,proposeHint,promptVersion,revisePlan} from "./ai";
import {assertReady} from "./ai-settings";
import {withAiBudget} from "./ai-budget";

const created=z.object({role:z.string().trim().min(3).max(180),jobDescription:z.string().trim().min(10).max(20000),
  focus:z.string().trim().max(1500).default(""),cvText:z.string().trim().min(15).max(30000),
  cvFilename:z.string().trim().max(180).default("pasted-cv.txt"),
  planImmediately:z.boolean().optional().default(true)});
const instruction=z.object({feedback:z.string().trim().min(3).max(1000),expectedRevision:z.number().int().positive()});
function owned(id:string,ownerId:string){
  const session=db.select().from(interviewSessions).where(and(eq(interviewSessions.id,id),eq(interviewSessions.ownerId,ownerId))).get();
  if(!session||session.mode!=="live")throw new DomainError("not_found","Live session not found");
  return session;
}
function planFor(scenarioId:string,revision:number){
 const row=db.select().from(scenarioPlans).where(and(eq(scenarioPlans.scenarioId,scenarioId),eq(scenarioPlans.revision,revision))).get();
 if(!row||!row.planJson)throw new DomainError("invalid","Live scenario plan not available");
 return {row,plan:planSchema.parse(JSON.parse(row.planJson))};
}
/** Session plan snapshot prevents editing a scenario from changing active question indexes. */
function planForSession(sessionId:string,scenarioId:string,revision:number){
 const saved=db.select({planJson:liveSessionSources.planJson}).from(liveSessionSources)
  .where(eq(liveSessionSources.sessionId,sessionId)).get();
 if(saved?.planJson)return planSchema.parse(JSON.parse(saved.planJson));
 return planFor(scenarioId,revision).plan;
}
function event(tx:typeof db,sessionId:string,type:string,metadata:Record<string,unknown>){
 const last=tx.select({seq:workflowEvents.seq}).from(workflowEvents)
 .where(eq(workflowEvents.sessionId,sessionId)).orderBy(desc(workflowEvents.seq)).limit(1).get();
 tx.insert(workflowEvents).values({id:randomUUID(),sessionId,seq:(last?.seq??0)+1,type,metadata:JSON.stringify(metadata),timestamp:Date.now()}).run();
}
export async function createLiveScenario(ownerId:string,payload:unknown){
 const input=created.parse(payload);
 if(!input.planImmediately){
  const total=db.select({n:count()}).from(scenarios).where(eq(scenarios.ownerId,ownerId)).get()!.n;
  const recent=db.select({n:count()}).from(scenarios).where(and(eq(scenarios.ownerId,ownerId),
   gte(scenarios.createdAt,Date.now()-3600000))).get()!.n;
  if(total>=100||recent>=12)throw new DomainError("limit","Scenario creation quota reached");
  const scenario=createScenario(ownerId,{role:input.role,jobDescription:input.jobDescription,focus:input.focus},{
    cvText:input.cvText,cvFilename:input.cvFilename,planJson:"",modelId:""
  });
  return getScenario(ownerId,scenario.id);
 }
 return withAiBudget(ownerId,{"action":"create","payload":input},async()=>{
  // Check before invoking billable AI; createScenario rechecks inside its transaction.
  const total=db.select({n:count()}).from(scenarios).where(eq(scenarios.ownerId,ownerId)).get()!.n;
  const recent=db.select({n:count()}).from(scenarios).where(and(eq(scenarios.ownerId,ownerId),
   gte(scenarios.createdAt,Date.now()-3600000))).get()!.n;
  if(total>=100||recent>=12)throw new DomainError("limit","Scenario creation quota reached");
  const generated=await planScenario(ownerId,input.role,input.jobDescription,input.cvText,input.focus);
  const scenario=createScenario(ownerId,{role:input.role,jobDescription:input.jobDescription,focus:input.focus},{
    cvText:input.cvText,cvFilename:input.cvFilename,planJson:JSON.stringify(generated.output),modelId:generated.modelId
  });
  return getScenario(ownerId,scenario.id);
 });
}
export async function reviseLiveScenario(ownerId:string,id:string,payload:unknown){
 const input=instruction.parse(payload);
 const scenario=getScenario(ownerId,id);
 if(scenario.latestRevision!==input.expectedRevision)throw new DomainError("conflict","Scenario revision conflict");
 if(scenario.latestRevision>=20)throw new DomainError("limit","Scenario revision limit reached");
return withAiBudget(ownerId,{"action":"revise","scenarioId":id,"revision":input.expectedRevision,"feedback":input.feedback},async()=>{
 const previous=planFor(id,scenario.latestRevision);
 const generated=await revisePlan(ownerId,previous.plan,input.feedback,scenario.jobDescription,previous.row.cvText);
 // CAS is rechecked by changeScenario after the slow LLM call.
 changeScenario(ownerId,id,{action:"revise",notes:input.feedback,expectedRevision:input.expectedRevision},{
   cvText:previous.row.cvText,cvFilename:previous.row.cvFilename,planJson:JSON.stringify(generated.output),modelId:generated.modelId
 });
 return getScenario(ownerId,id); });

}
export function currentPlan(ownerId:string,id:string){
 const scenario=getScenario(ownerId,id);
 const row=db.select().from(scenarioPlans).where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).get();
 if(!row||!row.planJson){
  return {scenario,plan:null,modelId:row?.modelId||null,cvFilename:row?.cvFilename||"",cvText:row?.cvText||""};
 }
 let plan:z.infer<typeof planSchema>|null=null;
 try{plan=planSchema.parse(JSON.parse(row.planJson));}catch{}
 return {scenario,plan,modelId:row.modelId,cvFilename:row.cvFilename,cvText:row.cvText};
}

const updateLiveInput=z.object({
  role:z.string().trim().min(3).max(180).optional(),
  jobDescription:z.string().trim().min(10).max(20000).optional(),
  focus:z.string().trim().max(1500).optional(),
  cvText:z.string().trim().min(15).max(30000).optional(),
  cvFilename:z.string().trim().max(180).optional(),
});
export async function updateLiveScenario(ownerId:string,id:string,payload:unknown){
 const data=updateLiveInput.parse(payload);
 const scenario=getScenario(ownerId,id);
 db.transaction((tx)=>{
  const latest=tx.select().from(scenarios)
   .where(and(eq(scenarios.id,id),eq(scenarios.ownerId,ownerId))).get();
  if(!latest||latest.latestRevision!==scenario.latestRevision)
   throw new DomainError("conflict","Scenario revision changed while editing");
  const revision=tx.select().from(scenarioRevisions)
   .where(and(eq(scenarioRevisions.scenarioId,id),eq(scenarioRevisions.revision,latest.latestRevision))).get();
  if(revision?.approvedAt)
   throw new DomainError("conflict","Approved revision is immutable; create an AI revision to edit the JD or CV");
  const toUpdate:Partial<typeof scenarios.$inferInsert>={};
  if(data.role!==undefined)toUpdate.role=data.role;
  if(data.jobDescription!==undefined)toUpdate.jobDescription=data.jobDescription;
  if(data.focus!==undefined)toUpdate.focus=data.focus;
  if(Object.keys(toUpdate).length>0){
   tx.update(scenarios).set(toUpdate).where(eq(scenarios.id,id)).run();
  }
  if(data.cvText!==undefined||data.cvFilename!==undefined){
   const existingPlan=tx.select().from(scenarioPlans)
    .where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).get();
   if(existingPlan){
    tx.update(scenarioPlans).set({
     ...(data.cvText!==undefined?{cvText:data.cvText}:{}),
     ...(data.cvFilename!==undefined?{cvFilename:data.cvFilename}:{}),
    }).where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).run();
   }else if(data.cvText){
    tx.insert(scenarioPlans).values({
     scenarioId:id,revision:scenario.latestRevision,
     cvText:data.cvText,cvFilename:data.cvFilename||"pasted-cv.txt",
     planJson:"",modelId:"",createdAt:Date.now()
    }).run();
   }
  }
 });
 return currentPlan(ownerId,id);
}

export async function planLiveScenario(ownerId:string,id:string,providedCvText?:string,instruction?:string){
 const scenario=getScenario(ownerId,id);
 if(scenario.revisions.some(rev=>rev.revision===scenario.latestRevision&&rev.approvedAt))
  throw new DomainError("conflict","Approved revision is immutable; use AI revision to create a new script");
 const existingPlan=db.select().from(scenarioPlans)
  .where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).get();
 const cvText=providedCvText?.trim() || existingPlan?.cvText?.trim() || "No candidate CV provided; assess candidate based strictly on role requirements and job description.";
 const cvFilename=existingPlan?.cvFilename||"pasted-cv.txt";
 const focus=[scenario.focus, instruction?.trim()].filter(Boolean).join(". Instruction: ");

 return withAiBudget(ownerId,{"action":"plan","scenarioId":id,"revision":scenario.latestRevision,"role":scenario.role,"jd":scenario.jobDescription,"focus":focus,"cv":cvText},async()=>{
  const generated=await planScenario(ownerId,scenario.role,scenario.jobDescription,cvText,focus);
  db.transaction((tx)=>{
   const latest=tx.select().from(scenarios)
    .where(and(eq(scenarios.id,id),eq(scenarios.ownerId,ownerId))).get();
   if(!latest||latest.latestRevision!==scenario.latestRevision)
    throw new DomainError("conflict","Scenario revision changed during planning");
   const revision=tx.select().from(scenarioRevisions)
    .where(and(eq(scenarioRevisions.scenarioId,id),eq(scenarioRevisions.revision,latest.latestRevision))).get();
   if(revision?.approvedAt)
    throw new DomainError("conflict","Scenario approved during planning; use AI revision instead");
   const planRow=tx.select().from(scenarioPlans)
    .where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).get();
   if(planRow){
    tx.update(scenarioPlans).set({
     planJson:JSON.stringify(generated.output),
     modelId:generated.modelId,
     ...(providedCvText ? { cvText: providedCvText } : {})
    }).where(and(eq(scenarioPlans.scenarioId,id),eq(scenarioPlans.revision,scenario.latestRevision))).run();
   }else{
    tx.insert(scenarioPlans).values({
     scenarioId:id,revision:scenario.latestRevision,
     cvText,cvFilename,
     planJson:JSON.stringify(generated.output),
     modelId:generated.modelId,
     createdAt:Date.now()
    }).run();
   }
  });
  return currentPlan(ownerId,id);
 });
}
/**
 * Capture the JD and CV actually used when a meeting starts. The scenario can
 * be edited later, but the source for this session must remain stable.
 */
export function startLive(ownerId:string,input:unknown) {
 assertReady(ownerId);
 const data=z.object({scenarioId:z.string().uuid(),revision:z.number().int().positive(),
  requestKey:z.string().uuid(),speech:z.unknown()}).parse(input);
 const scenario=getScenario(ownerId,data.scenarioId);
 const {row,plan}=planFor(data.scenarioId,data.revision);
 const speech=validateSpeechConfig(data.speech);
 if(plan.bilingual&&speech.interviewerLocale!==plan.bilingual.interviewerLocale)
  throw new DomainError("invalid","Interviewer language differs from this approved script. Regenerate a new revision with the desired Default interviewer language.");
 const started=createSession(ownerId,data,"live");
 db.insert(liveSessionSources).values({
  sessionId:started.id,role:scenario.role,jobDescription:scenario.jobDescription,
  focus:scenario.focus,cvText:row.cvText,cvFilename:row.cvFilename,
  planJson:row.planJson,createdAt:Date.now()
 }).onConflictDoNothing().run();
 return started;
}

/** Return only the source JD/CV, never the session's answers or transcript. */
export function getLiveSessionCloneSource(ownerId:string,id:string){
 const session=owned(id,ownerId);
 const saved=db.select().from(liveSessionSources).where(eq(liveSessionSources.sessionId,id)).get();
 if(saved)return {
  role:saved.role,jobDescription:saved.jobDescription,focus:saved.focus,
  cvText:saved.cvText,cvFilename:saved.cvFilename,source:"snapshot" as const
 };
 // For sessions created before the snapshot migration, use the matching
 // scenario revision's CV and the last saved JD (historical JD may have changed).
 const scenario=getScenario(ownerId,session.scenarioId);
 const revision=db.select().from(scenarioPlans)
  .where(and(eq(scenarioPlans.scenarioId,session.scenarioId),
   eq(scenarioPlans.revision,session.scenarioRevision))).get();
 if(!revision?.cvText)throw new DomainError("not_found","Original CV is not available for this session");
 return {
  role:scenario.role,jobDescription:scenario.jobDescription,focus:scenario.focus,
  cvText:revision.cvText,cvFilename:revision.cvFilename,source:"legacy" as const
 };
}
/** Persisted, server-controlled cursor for standalone vs interactive questions. */
export async function prepareLiveQuestion(ownerId:string,id:string){
 const session=owned(id,ownerId);
 if(session.state!=="IN_PROGRESS")throw new DomainError("transition","Interview not in progress");
 const snapshot=getSession(ownerId,id);
 const sequence=snapshot.turns.length+1;
 if(sequence>maxDemoTurns){
  // Recover old live sessions that reached the limit before auto-completion.
  try{return changeSession(ownerId,id,{action:"finish",expectedVersion:session.version});}
  catch(error){
   if(error instanceof DomainError&&error.kind==="conflict")return getSession(ownerId,id);
   throw error;
  }
 }
 const existing=db.select().from(liveQuestions)
  .where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence))).get();
 if(existing)return getSession(ownerId,id);

 const plan=planForSession(id,session.scenarioId,session.scenarioRevision);
 const speech=validateSpeechConfig(JSON.parse(session.speechConfig));
 const steps=plan.stages.flatMap(stage=>(stage.items||[]).map(item=>({...item,title:stage.topic})));
 const last=sequence===1?null:db.select().from(liveQuestions)
  .where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence-1))).get();
 const legacy=!!last&&last.itemIndex<0;
 const prev=last&&!legacy?{
  itemIndex:last.itemIndex,depth:last.followUpDepth,
  type:last.questionType==="interactive"?"interactive" as const:"standalone" as const
 }:null;

 function persist(data:{
  question:string;suggestedAnswer:string;competency:string;modelId:string;
  itemIndex:number;questionType:"standalone"|"interactive"|"legacy";
  followUpDepth:number;scenarioTitle:string;scenarioGoal:string;followUpLimit:number;action:string
 }){
  db.transaction(tx=>{
   const current=tx.select().from(interviewSessions).where(eq(interviewSessions.id,id)).get();
   const previousTurn=tx.select({sequence:interviewTurns.sequence}).from(interviewTurns)
    .where(eq(interviewTurns.sessionId,id)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
   if(current?.state!=="IN_PROGRESS"||(previousTurn?.sequence??0)+1!==sequence)
    throw new DomainError("conflict","Stale question generation");
   const row=tx.select().from(liveQuestions)
    .where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence))).get();
   if(row)return;
   tx.insert(liveQuestions).values({
    id:randomUUID(),sessionId:id,sequence,question:data.question,
    competency:data.competency,suggestedAnswer:data.suggestedAnswer,
    modelId:data.modelId,promptVersion,itemIndex:data.itemIndex,
    questionType:data.questionType,followUpDepth:data.followUpDepth,
    scenarioTitle:data.scenarioTitle,scenarioGoal:data.scenarioGoal,
    followUpLimit:data.followUpLimit,createdAt:Date.now()
   }).run();
   event(tx as unknown as typeof db,id,"question.prepared",{
    sequence,promptVersion,modelId:data.modelId,action:data.action,
    itemIndex:data.itemIndex,questionType:data.questionType,followUpDepth:data.followUpDepth
   });
  });
  return getSession(ownerId,id);
 }

 // Meetings started before migration keep the original adaptive question system.
 if(legacy||!steps.length){
  return withAiBudget(ownerId,{action:"question",sessionId:id,sequence},async()=>{
   const generated=await nextInterviewQuestion(ownerId,plan,snapshot.turns,speech.interviewerLocale);
   return persist({...generated.output,modelId:generated.modelId,
    itemIndex:-1,questionType:"legacy",followUpDepth:0,
    scenarioTitle:"",scenarioGoal:"",followUpLimit:0,action:"legacy_adaptive"});
  });
 }
 const current=prev?steps[prev.itemIndex]:undefined;
 const needsDecision=!!prev&&current?.type==="interactive"&&prev.depth<current.maxFollowUps;
 const execute=async()=>{
  const decision=needsDecision?await decideScenarioFollowUp(
   ownerId,current!,snapshot.turns,prev!.depth,speech.interviewerLocale):null;
  // Fallback to the next scripted item when AI drifts off-topic or repeats a question.
  const chosenAction=decision?.output.nextAction==="follow_up"&&
   !isRelevantScenarioFollowUp(
    [current!.prompt,current!.goal,current!.completionCriteria].join(" "),
    decision.output.question,snapshot.turns.map(turn=>turn.question))
   ?"next_question":decision?.output.nextAction??null;
  const position=nextFlowPosition(steps,prev,chosenAction,
   snapshot.turns.length,maxDemoTurns);
  if(position.kind==="finish"){
   const latest=owned(id,ownerId);
   if(latest.state==="IN_PROGRESS"){
    try{return changeSession(ownerId,id,{action:"finish",expectedVersion:latest.version});}
    catch(error){
     if(error instanceof DomainError&&error.kind==="conflict")return getSession(ownerId,id);
     throw error;
    }
   }
   return getSession(ownerId,id);
  }
  const item=steps[position.itemIndex]!;
  return persist({
   question:position.followUp?decision!.output.question:item.prompt,
   suggestedAnswer:position.followUp?decision!.output.suggestedAnswer:item.suggestedAnswer,
   competency:item.goal,
   modelId:position.followUp?decision!.modelId:"planned-script",
   itemIndex:position.itemIndex,questionType:item.type,followUpDepth:position.depth,
   scenarioTitle:item.title,scenarioGoal:item.goal,followUpLimit:item.maxFollowUps,
   action:position.followUp?"follow_up":"planned_question"
  });
 };
 // Static questions never consume provider calls or hourly AI capacity.
 return needsDecision?withAiBudget(ownerId,{action:"decision",sessionId:id,sequence},execute):execute();
}

export async function exposeHint(ownerId:string,id:string){
 const session=owned(id,ownerId);
 if(session.state!=="IN_PROGRESS")throw new DomainError("transition","Interview not in progress");
 const snapshot=getSession(ownerId,id);
 const sequence=snapshot.turns.length+1;
 const question=db.select().from(liveQuestions).where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence))).get();
 if(!question)throw new DomainError("invalid","Prepare interviewer question first");
 const existing=db.select().from(liveHints).where(and(eq(liveHints.sessionId,id),eq(liveHints.sequence,sequence))).get();
 if(existing)return {hint:existing.hint,modelId:existing.modelId,sequence};
return withAiBudget(ownerId,{"action":"hint","sessionId":id,"sequence":sequence},async()=>{
 const plan=planForSession(id,session.scenarioId,session.scenarioRevision);
 const generated=await proposeHint(ownerId,plan,question.question,snapshot.turns);
 db.transaction(tx=>{
  const row=tx.select().from(interviewSessions).where(eq(interviewSessions.id,id)).get();
  const last=tx.select({sequence:interviewTurns.sequence}).from(interviewTurns)
    .where(eq(interviewTurns.sessionId,id)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
  if(row?.state!=="IN_PROGRESS"||(last?.sequence??0)+1!==sequence)throw new DomainError("conflict","Stale hint");
  const already=tx.select().from(liveHints).where(and(eq(liveHints.sessionId,id),eq(liveHints.sequence,sequence))).get();
  if(!already){
   tx.insert(liveHints).values({id:randomUUID(),sessionId:id,sequence,hint:generated.output.hint,
     modelId:generated.modelId,createdAt:Date.now()}).run();
   event(tx as unknown as typeof db,id,"hint.exposed",{sequence,modelId:generated.modelId});
  }
 });
 const persisted=db.select().from(liveHints).where(and(eq(liveHints.sessionId,id),eq(liveHints.sequence,sequence))).get()!;
 return {hint:hintSchema.parse({hint:persisted.hint}).hint,modelId:persisted.modelId,sequence}; });

}
