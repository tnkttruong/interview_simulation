import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { DomainError, maxDemoTurns, validateSpeechConfig } from "@interview/core";
import { db } from "./db/client";
import { interviewSessions,interviewTurns,liveHints,liveQuestions,scenarioPlans,scenarios,workflowEvents } from "./db/schema";
import { changeScenario,createScenario,createSession,getScenario,getSession } from "./demo";
import {hintSchema,liveConfigured,nextInterviewQuestion,planScenario,planSchema,proposeHint,promptVersion,revisePlan} from "./ai";

const created=z.object({role:z.string().trim().min(3).max(180),jobDescription:z.string().trim().min(10).max(20000),
  focus:z.string().trim().max(1500).default(""),cvText:z.string().trim().min(15).max(30000),
  cvFilename:z.string().trim().max(180).default("pasted-cv.txt")});
const instruction=z.object({feedback:z.string().trim().min(3).max(1000),expectedRevision:z.number().int().positive()});
function owned(id:string,ownerId:string){
  const session=db.select().from(interviewSessions).where(and(eq(interviewSessions.id,id),eq(interviewSessions.ownerId,ownerId))).get();
  if(!session||session.mode!=="live")throw new DomainError("not_found","Live session not found");
  return session;
}
function planFor(scenarioId:string,revision:number){
 const row=db.select().from(scenarioPlans).where(and(eq(scenarioPlans.scenarioId,scenarioId),eq(scenarioPlans.revision,revision))).get();
 if(!row)throw new DomainError("invalid","Live scenario plan not available");
 return {row,plan:planSchema.parse(JSON.parse(row.planJson))};
}
function event(tx:typeof db,sessionId:string,type:string,metadata:Record<string,unknown>){
 const last=tx.select({seq:workflowEvents.seq}).from(workflowEvents)
 .where(eq(workflowEvents.sessionId,sessionId)).orderBy(desc(workflowEvents.seq)).limit(1).get();
 tx.insert(workflowEvents).values({id:randomUUID(),sessionId,seq:(last?.seq??0)+1,type,metadata:JSON.stringify(metadata),timestamp:Date.now()}).run();
}
export async function createLiveScenario(ownerId:string,payload:unknown){
 const input=created.parse(payload);
 // Check before invoking billable AI; createScenario rechecks inside its transaction.
 const total=db.select({n:count()}).from(scenarios).where(eq(scenarios.ownerId,ownerId)).get()!.n;
 const recent=db.select({n:count()}).from(scenarios).where(and(eq(scenarios.ownerId,ownerId),
  gte(scenarios.createdAt,Date.now()-3600000))).get()!.n;
 if(total>=100||recent>=12)throw new DomainError("limit","Scenario creation quota reached");
 const generated=await planScenario(input.role,input.jobDescription,input.cvText,input.focus);
 const scenario=createScenario(ownerId,{role:input.role,jobDescription:input.jobDescription,focus:input.focus});
 db.insert(scenarioPlans).values({scenarioId:scenario.id,revision:1,cvText:input.cvText,
   cvFilename:input.cvFilename,planJson:JSON.stringify(generated.output),modelId:generated.modelId,createdAt:Date.now()}).run();
 return getScenario(ownerId,scenario.id);
}
export async function reviseLiveScenario(ownerId:string,id:string,payload:unknown){
 const input=instruction.parse(payload);
 const scenario=getScenario(ownerId,id);
 if(scenario.latestRevision!==input.expectedRevision)throw new DomainError("conflict","Scenario revision conflict");
 if(scenario.latestRevision>=20)throw new DomainError("limit","Scenario revision limit reached");
 const previous=planFor(id,scenario.latestRevision);
 const generated=await revisePlan(previous.plan,input.feedback,scenario.jobDescription,previous.row.cvText);
 // CAS is rechecked by changeScenario after the slow LLM call.
 const updated=changeScenario(ownerId,id,{action:"revise",notes:input.feedback,expectedRevision:input.expectedRevision});
 db.insert(scenarioPlans).values({scenarioId:id,revision:updated.latestRevision,cvText:previous.row.cvText,
  cvFilename:previous.row.cvFilename,planJson:JSON.stringify(generated.output),modelId:generated.modelId,createdAt:Date.now()}).run();
 return getScenario(ownerId,id);
}
export function currentPlan(ownerId:string,id:string){
 const scenario=getScenario(ownerId,id);
 const planned=planFor(id,scenario.latestRevision);
 return {scenario,plan:planned.plan,modelId:planned.row.modelId,cvFilename:planned.row.cvFilename};
}
export function startLive(ownerId:string,input:unknown) {
 if(!liveConfigured())throw new DomainError("invalid","Live AI provider not configured");
 const data=z.object({scenarioId:z.string().uuid(),revision:z.number().int().positive(),
  requestKey:z.string().uuid(),speech:z.unknown()}).parse(input);
 // Keep legacy start, approval, snapshot, ownership and idempotency invariants.
 planFor(data.scenarioId,data.revision);
 validateSpeechConfig(data.speech);
 return createSession(ownerId,{...data,mode:"live"});
}
export async function prepareLiveQuestion(ownerId:string,id:string){
 const session=owned(id,ownerId);
 if(session.state!=="IN_PROGRESS")throw new DomainError("transition","Interview not in progress");
 const snapshot=getSession(ownerId,id);
 const sequence=snapshot.turns.length+1;
 if(sequence>maxDemoTurns)throw new DomainError("limit","Maximum live turns reached");
 const existing=db.select().from(liveQuestions).where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence))).get();
 if(existing)return getSession(ownerId,id);
 const {plan}=planFor(session.scenarioId,session.scenarioRevision);
 const speech=validateSpeechConfig(JSON.parse(session.speechConfig));
 const generated=await nextInterviewQuestion(plan,snapshot.turns,speech.interviewerLocale);
 db.transaction(tx=>{
  const row=tx.select().from(interviewSessions).where(eq(interviewSessions.id,id)).get();
  const last=tx.select({sequence:interviewTurns.sequence}).from(interviewTurns)
    .where(eq(interviewTurns.sessionId,id)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
  if(row?.state!=="IN_PROGRESS"||(last?.sequence??0)+1!==sequence)
    throw new DomainError("conflict","Stale question generation");
  const previous=tx.select().from(liveQuestions).where(and(eq(liveQuestions.sessionId,id),eq(liveQuestions.sequence,sequence))).get();
  if(previous)return;
  tx.insert(liveQuestions).values({id:randomUUID(),sessionId:id,sequence,
    question:generated.output.question,competency:generated.output.competency,
    modelId:generated.modelId,promptVersion,createdAt:Date.now()}).run();
  event(tx as unknown as typeof db,id,"question.prepared",{sequence,modelId:generated.modelId,promptVersion});
 });
 return getSession(ownerId,id);
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
 const {plan}=planFor(session.scenarioId,session.scenarioRevision);
 const generated=await proposeHint(plan,question.question,snapshot.turns);
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
 return {hint:hintSchema.parse({hint:persisted.hint}).hint,modelId:persisted.modelId,sequence};
}
