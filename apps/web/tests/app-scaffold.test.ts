import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("web app scaffold", () => {
  test("uses the repository Next and React major versions", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.name).toBe("@gooes/web");
    expect(pkg.dependencies.next).toBe("^15.3.0");
    expect(pkg.dependencies.react).toBe("^19.0.0");
  });

  test("is a standalone RSC application", () => {
    const nextConfig = read("next.config.ts");
    const layout = read("app/layout.tsx");
    const pkg = JSON.parse(read("package.json"));

    expect(nextConfig).toContain('output: "standalone"');
    expect(nextConfig).toContain("PHASE_DEVELOPMENT_SERVER");
    expect(nextConfig).toContain('process.env.NEXT_DIST_DIR ?? ".next-dev"');
    expect(layout).not.toMatch(/^\s*["']use client["'];?/m);
    expect(pkg.scripts.build).toBe(
      "next build && node scripts/sync-standalone-assets.mjs",
    );
    expect(pkg.scripts.start).toBe(
      "PORT=${PORT:-3020} HOSTNAME=${GOOES_WEB_HOSTNAME:-127.0.0.1} node .next/standalone/apps/web/server.js",
    );
    expect(existsSync(new URL("components.json", root))).toBe(true);
  });
});
