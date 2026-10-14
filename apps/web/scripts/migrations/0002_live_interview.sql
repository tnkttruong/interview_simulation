ALTER TABLE interview_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'demo';
CREATE TABLE scenario_plans (
 scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, cv_text TEXT NOT NULL, cv_filename TEXT NOT NULL,
 plan_json TEXT NOT NULL, model_id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(scenario_id,revision),
 FOREIGN KEY(scenario_id,revision) REFERENCES scenario_revisions(scenario_id,revision)
);
CREATE TABLE live_questions (
 id TEXT PRIMARY KEY NOT NULL,
 session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL, question TEXT NOT NULL, competency TEXT NOT NULL,
 model_id TEXT NOT NULL, prompt_version TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(session_id,sequence)
);
CREATE TABLE live_hints (
 id TEXT PRIMARY KEY NOT NULL,
 session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL, hint TEXT NOT NULL, model_id TEXT NOT NULL,
 created_at INTEGER NOT NULL, UNIQUE(session_id,sequence)
);
