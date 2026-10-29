-- Old live questions retain an empty suggestion; new questions save the AI answer.
ALTER TABLE live_questions ADD COLUMN suggested_answer TEXT NOT NULL DEFAULT '';
