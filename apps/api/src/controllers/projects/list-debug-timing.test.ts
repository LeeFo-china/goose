import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readProjectControllerSource() {
  return readFileSync(new URL("./index.ts", import.meta.url), "utf8");
}

describe("Project list debug timing", () => {
  test("exposes debug timing for the default project list response", () => {
    const source = readProjectControllerSource();
    const defaultListResponse = source.slice(
      source.indexOf("const phonePrivacyContext"),
      source.indexOf("override getById"),
    );

    expect(source).toContain("workflow_summary_ms");
    expect(source).toContain("workflow_filters_ms");
    expect(source).toContain("workflow_project_count");
    expect(source).toContain("debug_timing: buildProjectListDebugTiming");
    expect(defaultListResponse).toContain("...debugTiming");
  });
});
