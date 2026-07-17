import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const pageSourceUrl = new URL("./page.tsx", import.meta.url);
const source = existsSync(pageSourceUrl) ? readFileSync(pageSourceUrl, "utf8") : "";

describe("legacy camera route", () => {
  test("redirects to cameras and preserves query parameters", () => {
    expect(source).toContain('from "next/navigation"');
    expect(source).toContain("new URLSearchParams()");
    expect(source).toContain('"/cameras"');
    expect(source).toContain('`/cameras?${queryString}`');
    expect(source).toContain("redirect(buildRedirectHref(await searchParams))");
  });
});
