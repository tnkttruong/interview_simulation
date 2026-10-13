import { resolve, dirname, join } from "node:path";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
const root=resolve(process.env.APP_ROOT_DIR??resolve(process.cwd(),"../.."));
const path=resolve(root,process.env.DATABASE_URL??"data/interview.db");
mkdirSync(dirname(path),{recursive:true,mode:0o700});
const sqlite=new Database(path);
try {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const dir=resolve(dirname(fileURLToPath(import.meta.url)),"migrations");
  for (const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)).sort()) {
    if(sqlite.prepare("SELECT 1 FROM schema_migrations WHERE name=?").get(name)) continue;
    const sql=readFileSync(join(dir,name),"utf8");
    sqlite.transaction(()=>{
      sqlite.exec(sql);
      sqlite.prepare("INSERT INTO schema_migrations(name,applied_at) VALUES (?,?)").run(name,Date.now());
    })();
    console.log("Applied migration:",name);
  }
  console.log("Database ready:",path);
} finally { sqlite.close(); }
