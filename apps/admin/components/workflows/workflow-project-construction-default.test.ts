import { describe, expect, test } from "bun:test";
import { canSetProjectConstructionDefaultWorkflow } from "./workflow-project-construction-default";

describe("canSetProjectConstructionDefaultWorkflow", () => {
  test("only allows active published construction main workflows", () => {
    expect(canSetProjectConstructionDefaultWorkflow({
      workflow_key: "construction_main",
      category: "construction",
      status: "active",
      active_version_id: "version-1",
    })).toBe(true);

    expect(canSetProjectConstructionDefaultWorkflow({
      workflow_key: "project_signing",
      category: "signing",
      status: "active",
      active_version_id: "version-1",
    })).toBe(false);

    expect(canSetProjectConstructionDefaultWorkflow({
      workflow_key: "custom_construction_bucket",
      category: "construction",
      status: "active",
      active_version_id: "version-1",
    })).toBe(false);
  });
});
