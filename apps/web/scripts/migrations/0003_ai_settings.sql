-- Owner-scoped AI provider and language defaults. Credentials remain in server environment/CLI login.
CREATE TABLE ai_settings (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  interviewer_locale TEXT NOT NULL,
  candidate_stt_locale TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);