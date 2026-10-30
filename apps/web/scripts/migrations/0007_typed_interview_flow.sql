-- Historic live questions stay in legacy adaptive mode.
ALTER TABLE live_questions ADD COLUMN item_index INTEGER NOT NULL DEFAULT -1;
ALTER TABLE live_questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE live_questions ADD COLUMN follow_up_depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE live_questions ADD COLUMN follow_up_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE live_questions ADD COLUMN scenario_title TEXT NOT NULL DEFAULT '';
ALTER TABLE live_questions ADD COLUMN scenario_goal TEXT NOT NULL DEFAULT '';
