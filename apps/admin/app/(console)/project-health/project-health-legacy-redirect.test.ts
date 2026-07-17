import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("legacy project health route", () => {
  test("redirects to the project health section and preserves query parameters", () => {
    expect(source).toContain('from "next/navigation"');
    expect(source).toContain("new URLSearchParams()");
    expect(source).toContain('"/projects/health"');
    expect(source).toContain('`/projects/health?${queryString}`');
    expect(source).toContain("redirect(buildRedirectHref(await searchParams))");
  });
});
