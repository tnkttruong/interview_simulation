import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { getConfig } from "./config";

const config = getConfig();
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  secret: config.secret,
  baseURL: config.appURL,
  trustedOrigins: [config.appURL],
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
});
