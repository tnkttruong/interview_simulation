-- Preserve the JD/CV used at the start of each new live interview.
-- Older sessions are resolved from their scenario and matching CV revision.
CREATE TABLE live_session_sources (
 session_id TEXT PRIMARY KEY NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
 role TEXT NOT NULL,
 job_description TEXT NOT NULL,
 focus TEXT NOT NULL,
 cv_text TEXT NOT NULL,
 cv_filename TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
