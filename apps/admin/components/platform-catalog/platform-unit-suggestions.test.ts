import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台单位建议处理", () => {
  test("平台目录页挂载单位建议处理面板", () => {
    const source = readSource("../../app/(console)/platform/catalog/page.tsx");
    expect(source).toContain("PlatformUnitSuggestions");
  });

  test("单位建议支持批准与拒绝", () => {
    const source = readSource("./platform-unit-suggestions.tsx");
    expect(source).toContain("processPlatformUnitSuggestion");
    expect(source).toContain("approved");
    expect(source).toContain("rejected");
  });
});
