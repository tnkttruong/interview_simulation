-- Persist AI provider-call reservations before any billable or CLI operation.
-- One live call per account at a time, plus hourly account/global spend limits.
CREATE TABLE ai_call_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX ai_call_owner_hour_idx ON ai_call_attempts(owner_id,started_at);
CREATE INDEX ai_call_operation_idx ON ai_call_attempts(owner_id,operation_key,started_at);
CREATE INDEX ai_call_global_hour_idx ON ai_call_attempts(started_at);
