import "server-only";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
const projectRoot = process.env.APP_ROOT_DIR ?? resolve(process.cwd(), "../..");
// Server modules can be imported by a separate Next build worker; load root env here as well.
loadEnvConfig(projectRoot);
export function getConfig() {
  const demoMode = process.env.DEMO_MODE !== "false";
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.includes("replace-with")) {
    throw new Error("Set BETTER_AUTH_SECRET to a secure random string with at least 32 characters");
  }
  if (!demoMode && process.env.ENABLE_LOCAL_AI_CLI !== "true" && !(process.env.OPENAI_API_KEY && process.env.AI_MODEL)) throw new Error("Live mode requires OPENAI_API_KEY and AI_MODEL.");
  return {
    demoMode,
    secret,
    appURL: process.env.APP_URL ?? "http://localhost:3000",
    databaseFile: resolve(projectRoot, process.env.DATABASE_URL ?? "data/interview.db")
  };
}
