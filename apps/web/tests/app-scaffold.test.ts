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
    expect(read("next.config.ts")).toContain('output: "standalone"');
    expect(read("app/layout.tsx")).not.toContain('"use client"');
    expect(existsSync(new URL("components.json", root))).toBe(true);
  });
});
