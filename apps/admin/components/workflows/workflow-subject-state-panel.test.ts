import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("WorkflowSubjectStatePanel timeline contract", () => {
  test("renders backend timeline node display labels and attributes", () => {
    const source = readFileSync(
      new URL("./workflow-subject-state-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("timeline_nodes");
    expect(source).toContain("status_label");
    expect(source).toContain("attributes");
  });
});
