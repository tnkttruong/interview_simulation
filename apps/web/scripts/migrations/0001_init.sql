CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON session(user_id);
CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL, access_token TEXT, refresh_token TEXT, id_token TEXT,
  access_token_expires_at INTEGER, refresh_token_expires_at INTEGER,
  scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX account_user_idx ON account(user_id);
CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE scenarios (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL,
  job_description TEXT NOT NULL, focus TEXT NOT NULL, latest_revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, FOREIGN KEY(owner_id) REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX scenarios_owner_idx ON scenarios(owner_id);
CREATE TABLE scenario_revisions (
  scenario_id TEXT NOT NULL, revision INTEGER NOT NULL, approved_at INTEGER, notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(scenario_id,revision), FOREIGN KEY(scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
);
CREATE TABLE interview_sessions (
  id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, scenario_id TEXT NOT NULL,
  scenario_revision INTEGER NOT NULL, request_key TEXT NOT NULL,
  speech_config TEXT NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(owner_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
  UNIQUE(owner_id,request_key),
  FOREIGN KEY(scenario_id,scenario_revision) REFERENCES scenario_revisions(scenario_id,revision)
);
CREATE INDEX interview_sessions_owner_idx ON interview_sessions(owner_id);
CREATE TABLE interview_turns (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL,
  client_turn_id TEXT NOT NULL, sequence INTEGER NOT NULL,
  question TEXT NOT NULL, answer TEXT NOT NULL, answer_source TEXT NOT NULL,
  original_stt TEXT, created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id,client_turn_id), UNIQUE(session_id,sequence)
);
CREATE TABLE workflow_events (
  id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, seq INTEGER NOT NULL,
  type TEXT NOT NULL, metadata TEXT NOT NULL, timestamp INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id,seq)
);
CREATE INDEX workflow_events_session_idx ON workflow_events(session_id);
