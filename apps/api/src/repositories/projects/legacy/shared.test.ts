import { describe, expect, test } from "bun:test";
import { PROJECT_DETAIL_SELECT } from "./shared";

describe("project detail select", () => {
  test("uses explicit project fields instead of selecting every column", () => {
    const select = PROJECT_DETAIL_SELECT
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(select).not.toContain("*,");
    expect(select).toContain("id,");
    expect(select).toContain("tenant_id,");
    expect(select).toContain("construction_workflow_definition_id,");
  });
});
