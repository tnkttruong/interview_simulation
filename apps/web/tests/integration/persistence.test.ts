import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("reruns migrations after restart without losing persisted interview data", () => {
  const dir = mkdtempSync(join(tmpdir(), "interview-p0-"));
  const path = join(dir, "persist.db");
  const script = resolve(process.cwd(), "scripts/migrate.mjs");
  const env = { ...process.env, APP_ROOT_DIR: resolve(process.cwd(), "../.."), DATABASE_URL: path };
  const migrate = () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(), env, encoding: "utf8"
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  };
  try {
    migrate();
    const db = new Database(path);
    try {
      db.pragma("foreign_keys = ON");
      const userId = randomUUID();
      const scenarioId = randomUUID();
      const sessionId = randomUUID();
      const timestamp = Date.now();
      db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)")
        .run(userId, "Persist", `${userId}@example.test`, timestamp, timestamp);
      db.prepare("INSERT INTO scenarios(id,owner_id,role,job_description,focus,latest_revision,created_at) VALUES (?,?,?,?,?,?,?)")
        .run(scenarioId, userId, "Engineer", "Build reliable services", "SQL", 1, timestamp);
      db.prepare("INSERT INTO scenario_revisions(scenario_id,revision,approved_at,notes) VALUES (?,?,?,?)")
        .run(scenarioId, 1, timestamp, "Initial");
      db.prepare("INSERT INTO interview_sessions(id,owner_id,scenario_id,scenario_revision,request_key,speech_config,state,version,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(sessionId, userId, scenarioId, 1, randomUUID(), JSON.stringify({
          interviewerLocale: "vi-VN", interviewerVoiceId: "vi-VN-HoaiMyNeural",
          candidateSttLocale: "en-US", consentToTranscript: true
        }), "IN_PROGRESS", 4, timestamp);
      db.prepare("INSERT INTO interview_turns(id,session_id,client_turn_id,sequence,question,answer,answer_source,original_stt,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(randomUUID(), sessionId, randomUUID(), 1, "Xin chào", "Hello", "typed", null, timestamp);
      db.prepare("INSERT INTO workflow_events(id,session_id,seq,type,metadata,timestamp) VALUES (?,?,?,?,?,?)")
        .run(randomUUID(), sessionId, 1, "answer.committed", "{}", timestamp);
    } finally {
      db.close();
    }
    // Model an application restart with a persisted volume and migration bootstrap.
    migrate();
    const reopened = new Database(path);
    try {
      expect((reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {count:number}).count).toBe(5);
      expect((reopened.prepare("SELECT COUNT(*) AS count FROM interview_turns").get() as {count:number}).count).toBe(1);
      expect((reopened.prepare("SELECT COUNT(*) AS count FROM workflow_events").get() as {count:number}).count).toBe(1);
      expect((reopened.prepare("SELECT COUNT(*) AS count FROM live_questions").get() as {count:number}).count).toBe(0);
      expect((reopened.prepare("PRAGMA table_info(live_questions)").all() as {name:string}[])
        .some(column=>column.name==="suggested_answer")).toBe(true);
      expect((reopened.prepare("SELECT COUNT(*) AS count FROM scenario_plans").get() as {count:number}).count).toBe(0);
      expect(reopened.prepare("SELECT question, answer FROM interview_turns").get())
        .toEqual({question:"Xin chào",answer:"Hello"});
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
