import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const createNextConfig = (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER
      ? process.env.NEXT_DIST_DIR ?? ".next-dev"
      : ".next",
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: join(appDir, "../.."),
});

export default createNextConfig;
