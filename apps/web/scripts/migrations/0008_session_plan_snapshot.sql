-- Protect active interviews against later scenario edits.
ALTER TABLE live_session_sources ADD COLUMN plan_json TEXT NOT NULL DEFAULT '';
