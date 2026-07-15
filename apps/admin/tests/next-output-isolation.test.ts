import { describe, expect, test } from "bun:test";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import createNextConfig from "../next.config";

describe("admin Next output isolation", () => {
  test("separates normal development, E2E, and production outputs", () => {
    const previousDistDir = process.env.NEXT_DIST_DIR;

    try {
      delete process.env.NEXT_DIST_DIR;
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");

      process.env.NEXT_DIST_DIR = ".next-e2e";
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-e2e");
      expect(createNextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
    } finally {
      if (previousDistDir === undefined) {
        delete process.env.NEXT_DIST_DIR;
      } else {
        process.env.NEXT_DIST_DIR = previousDistDir;
      }
    }
  });
});
