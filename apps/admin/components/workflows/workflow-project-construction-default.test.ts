import { describe, expect, test } from "bun:test";
import { canSetProjectConstructionDefaultWorkflow } from "./workflow-project-construction-default";

describe("canSetProjectConstructionDefaultWorkflow", () => {
  test("allows any active published construction workflow", () => {
    expect(canSetProjectConstructionDefaultWorkflow({
      workflow_key: "construction_main",
      category: "construction",
      status: "active",
      active_version_id: "version-1",
    })).toBe(true);

    expect(canSetProjectConstructionDefaultWorkflow({
      workflow_key: "construction_custom_mq7hqqgl_1_d0c5a149",
      category: "construction",
      status: "active",
      active_version_id: "version-7",
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
      status: "archived",
      active_version_id: "version-1",
    })).toBe(false);
  });
});
