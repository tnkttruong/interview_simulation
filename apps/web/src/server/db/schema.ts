import { integer, sqliteTable, text, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});
export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  jobDescription: text("job_description").notNull(),
  focus: text("focus").notNull(),
  latestRevision: integer("latest_revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
export const scenarioRevisions = sqliteTable("scenario_revisions", {
  scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  approvedAt: integer("approved_at"),
  notes: text("notes").notNull().default(""),
}, (t) => [primaryKey({ columns: [t.scenarioId, t.revision] })]);
export const interviewSessions = sqliteTable("interview_sessions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  scenarioId: text("scenario_id").notNull().references(() => scenarios.id, { onDelete: "cascade" }),
  scenarioRevision: integer("scenario_revision").notNull(),
  requestKey: text("request_key").notNull(),
  mode: text("mode").notNull().default("demo"),
  speechConfig: text("speech_config").notNull(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("owner_request_unique").on(t.ownerId,t.requestKey)]);
export const interviewTurns = sqliteTable("interview_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  clientTurnId: text("client_turn_id").notNull(),
  sequence: integer("sequence").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  answerSource: text("answer_source").notNull(),
  originalStt: text("original_stt"),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  uniqueIndex("session_client_turn_unique").on(t.sessionId,t.clientTurnId),
  uniqueIndex("session_sequence_unique").on(t.sessionId,t.sequence),
]);
export const workflowEvents = sqliteTable("workflow_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => interviewSessions.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  metadata: text("metadata").notNull(),
  timestamp: integer("timestamp").notNull(),
}, (t) => [uniqueIndex("session_event_seq_unique").on(t.sessionId,t.seq)]);

export const scenarioPlans = sqliteTable("scenario_plans",{
  scenarioId:text("scenario_id").notNull().references(()=>scenarios.id,{onDelete:"cascade"}),
  revision:integer("revision").notNull(),
  cvText:text("cv_text").notNull(),
  cvFilename:text("cv_filename").notNull(),
  planJson:text("plan_json").notNull(),
  modelId:text("model_id").notNull(),
  createdAt:integer("created_at").notNull(),
}, t=>[primaryKey({columns:[t.scenarioId,t.revision]})]);
export const liveQuestions = sqliteTable("live_questions",{
  id:text("id").primaryKey(),
  sessionId:text("session_id").notNull().references(()=>interviewSessions.id,{onDelete:"cascade"}),
  sequence:integer("sequence").notNull(),
  question:text("question").notNull(),
  competency:text("competency").notNull(),
  modelId:text("model_id").notNull(),
  promptVersion:text("prompt_version").notNull(),
  createdAt:integer("created_at").notNull()
},t=>[uniqueIndex("live_question_seq").on(t.sessionId,t.sequence)]);
export const liveHints = sqliteTable("live_hints",{
  id:text("id").primaryKey(),
  sessionId:text("session_id").notNull().references(()=>interviewSessions.id,{onDelete:"cascade"}),
  sequence:integer("sequence").notNull(),
  hint:text("hint").notNull(),
  modelId:text("model_id").notNull(),
  createdAt:integer("created_at").notNull()
},t=>[uniqueIndex("live_hint_seq").on(t.sessionId,t.sequence)]);

export const aiSettings=sqliteTable("ai_settings",{
  ownerId:text("owner_id").primaryKey().references(()=>user.id,{onDelete:"cascade"}),
  provider:text("provider").notNull(),
  model:text("model").notNull(),
  interviewerLocale:text("interviewer_locale").notNull(),
  candidateSttLocale:text("candidate_stt_locale").notNull(),
  voiceId:text("voice_id").notNull(),
  updatedAt:integer("updated_at").notNull()
});
