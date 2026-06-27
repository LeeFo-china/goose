import { describe, expect, test } from "bun:test";
import {
  canRemoveProjectConstructionCandidateWorkflow,
  canSetProjectConstructionDefaultWorkflow,
} from "./workflow-project-construction-default";

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

describe("canRemoveProjectConstructionCandidateWorkflow", () => {
  test("allows removing only non-default selectable construction candidates", () => {
    expect(canRemoveProjectConstructionCandidateWorkflow({
      category: "construction",
      project_construction_binding: {
        id: "binding-1",
        tenant_id: "tenant-1",
        subject_type: "project",
        workflow_purpose: "construction",
        definition_id: "definition-1",
        selectable: true,
        is_default: false,
        created_at: "2026-06-27T00:00:00.000Z",
        updated_at: "2026-06-27T00:00:00.000Z",
      },
    })).toBe(true);

    expect(canRemoveProjectConstructionCandidateWorkflow({
      category: "construction",
      project_construction_binding: {
        id: "binding-2",
        tenant_id: "tenant-1",
        subject_type: "project",
        workflow_purpose: "construction",
        definition_id: "definition-2",
        selectable: true,
        is_default: true,
        created_at: "2026-06-27T00:00:00.000Z",
        updated_at: "2026-06-27T00:00:00.000Z",
      },
    })).toBe(false);

    expect(canRemoveProjectConstructionCandidateWorkflow({
      category: "construction",
      project_construction_binding: null,
    })).toBe(false);

    expect(canRemoveProjectConstructionCandidateWorkflow({
      category: "signing",
      project_construction_binding: {
        id: "binding-3",
        tenant_id: "tenant-1",
        subject_type: "project",
        workflow_purpose: "construction",
        definition_id: "definition-3",
        selectable: true,
        is_default: false,
        created_at: "2026-06-27T00:00:00.000Z",
        updated_at: "2026-06-27T00:00:00.000Z",
      },
    })).toBe(false);
  });
});
