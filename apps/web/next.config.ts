import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", transpilePackages: ["@interview/core"], serverExternalPackages: ["better-sqlite3"] };
export default config;
