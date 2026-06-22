import { describe, expect, test } from "bun:test";
import { isUsableConstructionWorkflowDefinition } from "./project-construction-workflow-selection";
import type { WorkflowDefinitionRow } from "@/repositories/workflows";

const NOW = "2026-06-22T00:00:00.000Z";

describe("isUsableConstructionWorkflowDefinition", () => {
  test("accepts only active published construction main track definitions", () => {
    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "construction_main",
      category: "construction",
    }))).toBe(true);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "project_signing",
      category: "signing",
    }))).toBe(false);

    expect(isUsableConstructionWorkflowDefinition(definition({
      workflow_key: "custom_construction_bucket",
      category: "construction",
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
    active_version_id: input.active_version_id ?? "version-1",
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}
