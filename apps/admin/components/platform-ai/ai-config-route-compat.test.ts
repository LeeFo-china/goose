import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("AI config admin route compatibility", () => {
  test("redirects legacy page URL to AI model routing page", () => {
    const page = readSource("../../app/(console)/platform/ai-config/page.tsx");

    expect(page).toContain('import { redirect } from "next/navigation";');
    expect(page).toContain('redirect("/platform/ai-models");');
  });
});
