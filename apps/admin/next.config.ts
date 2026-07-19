import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const createNextConfig = (phase: string): NextConfig => {
  const isDevelopment = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    distDir: isDevelopment
      ? process.env.NEXT_DIST_DIR ?? ".next-dev"
      : ".next",
    poweredByHeader: false,
    output: "standalone",
    outputFileTracingRoot: join(appDir, "../.."),
    typescript: {
      tsconfigPath: isDevelopment ? "tsconfig.json" : "tsconfig.typecheck.json",
    },
  };
};

export default createNextConfig;
