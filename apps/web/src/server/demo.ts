import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDemoQuestion, maxDemoTurns, transition, validateSpeechConfig, type SessionState } from "@interview/core";
import { db } from "./db/client";
import { interviewSessions, interviewTurns, scenarioRevisions, scenarios, workflowEvents } from "./db/schema";

const now = () => Date.now();
const scenarioInput = z.object({
  role: z.string().trim().min(3).max(180),
  jobDescription: z.string().trim().min(10).max(20000),
  focus: z.string().trim().max(1500).default(""),
});
const startInput = z.object({
  scenarioId: z.string().uuid(),
  revision: z.number().int().positive(),
  requestKey: z.string().uuid(),
  speech: z.unknown(),
});
const answerInput = z.object({
  clientTurnId: z.string().uuid(),
  expectedTurnSequence: z.number().int().min(1).max(maxDemoTurns),
  answer: z.string().trim().min(1).max(12000),
  // P0 does not expose a trusted STT provider. Validate provenance with provider evidence in P2.
  source: z.literal("typed").default("typed"),
  originalStt: z.never().optional(),
});
type UserId = string;
const HOUR_MS = 3600000;
const MAX_SCENARIOS_PER_HOUR = 12;
const MAX_SCENARIOS_PER_OWNER = 100;
const MAX_SESSIONS_PER_HOUR = 30;
const MAX_SESSIONS_PER_OWNER = 300;
const MAX_SCENARIO_REVISIONS = 20;
const MAX_SESSION_STATE_CHANGES = 100;
function requireCreationCapacity(total: number, recent: number, maxTotal: number, maxHourly: number) {
  if (total >= maxTotal) throw new Error("Account storage quota reached");
  if (recent >= maxHourly) throw new Error("Hourly creation limit reached");
}


function addEvent(tx: Pick<typeof db, "select" | "insert">, sessionId: string, type: string, metadata: Record<string, unknown> = {}) {
  const previous = tx.select({ seq: workflowEvents.seq }).from(workflowEvents)
    .where(eq(workflowEvents.sessionId, sessionId)).orderBy(desc(workflowEvents.seq)).limit(1).get();
  tx.insert(workflowEvents).values({
    id: randomUUID(), sessionId, seq: (previous?.seq ?? 0) + 1,
    type, metadata: JSON.stringify(metadata), timestamp: now()
  }).run();
}
function requireOwnedScenario(ownerId: UserId, scenarioId: string) {
  const row = db.select().from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.ownerId, ownerId))).get();
  if (!row) throw new Error("Scenario not found");
  return row;
}
function requireOwnedSession(ownerId: UserId, sessionId: string) {
  const row = db.select().from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.ownerId, ownerId))).get();
  if (!row) throw new Error("Session not found");
  return row;
}
export function listScenarios(ownerId: UserId, limit: number, offset: number) {
  const total = db.select({ value: count() }).from(scenarios).where(eq(scenarios.ownerId, ownerId)).get()!.value;
  const items = db.select({ id: scenarios.id, role: scenarios.role, focus: scenarios.focus,
    latestRevision: scenarios.latestRevision, createdAt: scenarios.createdAt })
    .from(scenarios).where(eq(scenarios.ownerId, ownerId))
    .orderBy(desc(scenarios.createdAt), desc(scenarios.id)).limit(limit).offset(offset).all();
  return { items, total, nextOffset: offset + items.length < total ? offset + items.length : null };
}
export function createScenario(ownerId: UserId, payload: unknown) {
  const input = scenarioInput.parse(payload);
  return db.transaction((tx) => {
    const total = tx.select({ value: count() }).from(scenarios).where(eq(scenarios.ownerId, ownerId)).get()!.value;
    const recent = tx.select({ value: count() }).from(scenarios).where(and(eq(scenarios.ownerId, ownerId),
      gte(scenarios.createdAt, now() - HOUR_MS))).get()!.value;
    requireCreationCapacity(total, recent, MAX_SCENARIOS_PER_OWNER, MAX_SCENARIOS_PER_HOUR);
    const scenario = { id: randomUUID(), ownerId, ...input, latestRevision: 1, createdAt: now() };
    tx.insert(scenarios).values(scenario).run();
    tx.insert(scenarioRevisions).values({ scenarioId: scenario.id, revision: 1, notes: "Initial demo scenario", approvedAt: null }).run();
    return scenario;
  });
}
export function getScenario(ownerId: UserId, id: string) {
  const scenario = requireOwnedScenario(ownerId, id);
  const revisions = db.select().from(scenarioRevisions)
    .where(eq(scenarioRevisions.scenarioId, id)).orderBy(desc(scenarioRevisions.revision)).all();
  return { ...scenario, revisions };
}
export function changeScenario(ownerId: UserId, id: string, payload: unknown) {
  const input = z.discriminatedUnion("action", [
    z.object({ action: z.literal("approve"), expectedRevision: z.number().int().positive() }),
    z.object({ action: z.literal("revise"), expectedRevision: z.number().int().positive(), notes: z.string().trim().min(1).max(1000) })
  ]).parse(payload);
  return db.transaction((tx) => {
    const scenario = tx.select().from(scenarios).where(and(eq(scenarios.id,id),eq(scenarios.ownerId,ownerId))).get();
    if (!scenario) throw new Error("Scenario not found");
    if (scenario.latestRevision !== input.expectedRevision) throw new Error("Scenario revision conflict");
    if (input.action === "revise") {
      const revision = scenario.latestRevision + 1;
      tx.insert(scenarioRevisions).values({ scenarioId:id, revision, notes:input.notes, approvedAt:null }).run();
      tx.update(scenarios).set({ latestRevision: revision }).where(eq(scenarios.id,id)).run();
    } else {
      const current = tx.select().from(scenarioRevisions).where(and(eq(scenarioRevisions.scenarioId,id), eq(scenarioRevisions.revision,scenario.latestRevision))).get();
      if (!current?.approvedAt) tx.update(scenarioRevisions).set({ approvedAt:now() })
        .where(and(eq(scenarioRevisions.scenarioId,id),eq(scenarioRevisions.revision,scenario.latestRevision))).run();
    }
    return getScenario(ownerId,id);
  });
}
export function listSessions(ownerId: UserId, limit: number, offset: number) {
  const total = db.select({value:count()}).from(interviewSessions)
    .where(eq(interviewSessions.ownerId,ownerId)).get()!.value;
  const items = db.select({ id: interviewSessions.id, state: interviewSessions.state, version: interviewSessions.version,
    scenarioId: interviewSessions.scenarioId, scenarioRevision: interviewSessions.scenarioRevision,
    createdAt: interviewSessions.createdAt, speechConfig: interviewSessions.speechConfig })
    .from(interviewSessions).where(eq(interviewSessions.ownerId,ownerId))
    .orderBy(desc(interviewSessions.createdAt),desc(interviewSessions.id)).limit(limit).offset(offset).all();
  return {items,total,nextOffset:offset+items.length<total?offset+items.length:null};
}
export function getSession(ownerId:UserId, id:string) {
  const session = requireOwnedSession(ownerId,id);
  const turns = db.select().from(interviewTurns).where(eq(interviewTurns.sessionId,id))
    .orderBy(interviewTurns.sequence).all();
  const scenario = requireOwnedScenario(ownerId,session.scenarioId);
  const speech = validateSpeechConfig(JSON.parse(session.speechConfig));
  return { ...session, scenario: { role: scenario.role, focus: scenario.focus }, turns,
    nextQuestion: session.state === "IN_PROGRESS" && turns.length < maxDemoTurns
      ? getDemoQuestion(turns.length, speech.interviewerLocale) : null };
}
export function createSession(ownerId: UserId, payload: unknown) {
  const input = startInput.parse(payload);
  const speech = validateSpeechConfig(input.speech);
  return db.transaction((tx) => {
    const existing = tx.select().from(interviewSessions)
      .where(and(eq(interviewSessions.ownerId,ownerId),eq(interviewSessions.requestKey,input.requestKey))).get();
    if (existing) {
      if (existing.scenarioId !== input.scenarioId || existing.scenarioRevision !== input.revision ||
          existing.speechConfig !== JSON.stringify(speech)) throw new Error("Request key conflict");
      return getSession(ownerId,existing.id);
    }
    const total = tx.select({value:count()}).from(interviewSessions)
      .where(eq(interviewSessions.ownerId,ownerId)).get()!.value;
    const recent = tx.select({value:count()}).from(interviewSessions).where(and(eq(interviewSessions.ownerId,ownerId),
      gte(interviewSessions.createdAt,now()-HOUR_MS))).get()!.value;
    requireCreationCapacity(total,recent,MAX_SESSIONS_PER_OWNER,MAX_SESSIONS_PER_HOUR);
    const scenario = tx.select().from(scenarios).where(and(eq(scenarios.id,input.scenarioId),eq(scenarios.ownerId,ownerId))).get();
    if (!scenario || scenario.latestRevision !== input.revision) throw new Error("Latest scenario revision required");
    const approved = tx.select().from(scenarioRevisions).where(and(
      eq(scenarioRevisions.scenarioId,scenario.id),eq(scenarioRevisions.revision,input.revision)
    )).get();
    if (!approved?.approvedAt) throw new Error("Scenario approval required");
    const record = { id:randomUUID(), ownerId, scenarioId:scenario.id, scenarioRevision:input.revision,
      requestKey:input.requestKey, speechConfig:JSON.stringify(speech),
      state:"CREATED", version:1, createdAt:now() };
    tx.insert(interviewSessions).values(record).run();
    addEvent(tx,record.id,"session.created",{scenarioRevision:input.revision});
    let state: SessionState = "CREATED";
    for (const [action,type] of [["enterPreflight","preflight.entered"],["skipDemoPreflight","preflight.demo_skipped"],["start","interview.started"]] as const) {
      state = transition(state,action);
      addEvent(tx,record.id,type,{mode:"demo"});
    }
    tx.update(interviewSessions).set({state,version:4}).where(eq(interviewSessions.id,record.id)).run();
    return getSession(ownerId,record.id);
  });
}
export function submitAnswer(ownerId: UserId, id: string, payload: unknown) {
  const input = answerInput.parse(payload);
  return db.transaction((tx) => {
    const session = tx.select().from(interviewSessions)
      .where(and(eq(interviewSessions.id,id),eq(interviewSessions.ownerId,ownerId))).get();
    if (!session) throw new Error("Session not found");
    const existing = tx.select().from(interviewTurns)
      .where(and(eq(interviewTurns.sessionId,id),eq(interviewTurns.clientTurnId,input.clientTurnId))).get();
    if (existing) {
      // The idempotency key is bound to the normalized command, not just the turn ID.
      if (existing.answer !== input.answer || existing.answerSource !== input.source || existing.originalStt !== null || existing.sequence !== input.expectedTurnSequence)
        throw new Error("Answer request key conflict");
      return getSession(ownerId,id);
    }
    if (session.state !== "IN_PROGRESS") throw new Error("Session is not accepting answers");
    const last = tx.select({ sequence: interviewTurns.sequence }).from(interviewTurns)
      .where(eq(interviewTurns.sessionId,id)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
    const sequence = (last?.sequence ?? 0) + 1;
    if (sequence > maxDemoTurns) throw new Error("Demo turn limit reached");
    if (sequence !== input.expectedTurnSequence) throw new Error("Stale question conflict");
    const speech = validateSpeechConfig(JSON.parse(session.speechConfig));
    tx.insert(interviewTurns).values({
      id:randomUUID(), sessionId:id, clientTurnId:input.clientTurnId, sequence,
      question:getDemoQuestion(sequence-1, speech.interviewerLocale), answer:input.answer, answerSource:input.source,
      originalStt:null, createdAt:now()
    }).run();
    addEvent(tx,id,"answer.committed",{sequence,source:input.source});
    return getSession(ownerId,id);
  });
}
export function changeSession(ownerId:UserId,id:string,payload:unknown) {
  const input = z.object({ action:z.enum(["pause","resume","finish","cancel","connectionLost"]),
    expectedVersion:z.number().int().positive() }).parse(payload);
  return db.transaction((tx) => {
    const row = tx.select().from(interviewSessions)
      .where(and(eq(interviewSessions.id,id),eq(interviewSessions.ownerId,ownerId))).get();
    if (!row) throw new Error("Session not found");
    if (row.version !== input.expectedVersion) throw new Error("Session version conflict");
    const state = transition(row.state as SessionState,input.action);
    tx.update(interviewSessions).set({state,version:row.version+1}).where(eq(interviewSessions.id,id)).run();
    addEvent(tx,id,"interview."+input.action,{from:row.state,to:state});
    return getSession(ownerId,id);
  });
}
export function getEvidence(ownerId:UserId,id:string) {
  requireOwnedSession(ownerId,id);
  return db.select().from(workflowEvents).where(eq(workflowEvents.sessionId,id)).orderBy(workflowEvents.seq).all();
}
