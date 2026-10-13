import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
// pnpm --filter runs Next from apps/web; load root .env for the single-service OSS setup.
loadEnvConfig(resolve(process.cwd(), "../.."));
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  transpilePackages: ["@interview/core"],
  serverExternalPackages: ["better-sqlite3"],
};
export default config;
