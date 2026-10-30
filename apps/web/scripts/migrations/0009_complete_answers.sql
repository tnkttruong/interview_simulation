-- Existing live questions keep the original suggested answer; newly prepared questions store a distinct complete sample response.
ALTER TABLE live_questions ADD COLUMN full_answer TEXT NOT NULL DEFAULT '';
