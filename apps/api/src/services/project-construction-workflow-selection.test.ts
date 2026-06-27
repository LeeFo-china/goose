import { describe, expect, mock, test } from "bun:test";
import type { WorkflowDefinitionRow } from "@/repositories/workflows";

const NOW = "2026-06-22T00:00:00.000Z";

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {},
}));

mock.module("@/repositories/projects", () => ({
  projectRepository: {},
}));

describe("isUsableConstructionWorkflowDefinition", () => {
  test("accepts any active published construction definition", async () => {
    const { isUsableConstructionWorkflowDefinition } = await import(
      "./project-construction-workflow-selection"
    );

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "construction_main",
      category: "construction",
    }))).toBe(true);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "construction_custom_mq7hqqgl_1_d0c5a149",
      category: "construction",
    }))).toBe(true);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "project_signing",
      category: "signing",
    }))).toBe(false);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "custom_construction_bucket",
      category: "construction",
      status: "archived",
    }))).toBe(false);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "draft_construction_bucket",
      category: "construction",
      active_version_id: null,
    }))).toBe(false);
  });
});

function definition(input: {
  workflow_key: string;
  category: WorkflowDefinitionRow["category"];
  status?: WorkflowDefinitionRow["status"];
  active_version_id?: string | null;
}): WorkflowDefinitionRow {
  return {
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: input.workflow_key,
    name: input.workflow_key,
    description: null,
    category: input.category,
    status: input.status ?? "active",
    active_version_id: Object.hasOwn(input, "active_version_id")
      ? input.active_version_id ?? null
      : "version-1",
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}
