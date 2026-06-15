import { describe, expect, mock, test } from "bun:test";

const getRuntimeInstanceById = mock(async () => ({
  id: "instance-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  version_id: "version-1",
  subject_type: "project",
  subject_id: "project-1",
  status: "running",
  context: {},
  current_node_id: "node-payment",
  current_node_key: "payment_stage_2",
  current_node_snapshot: {
    id: "node-payment",
    node_key: "payment_stage_2",
    business_kind: "payment_collection",
    config: { payment_type: "stage_2" },
  },
  started_by: null,
  completed_by: null,
  started_at: "2026-06-15T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-06-15T00:00:00.000Z",
  updated_at: "2026-06-15T00:00:00.000Z",
}));

const getGraph = mock(async () => ({
  definition: {
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: "project_workflow",
    name: "项目流程",
    description: null,
    category: "project",
    status: "published",
    active_version_id: "version-1",
    created_by: null,
    updated_by: null,
    created_at: "2026-06-15T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z",
  },
  version: null,
  nodes: [
    {
      id: "node-payment",
      tenant_id: "tenant-1",
      definition_id: "definition-1",
      node_key: "payment_stage_2",
      node_type: "confirmation",
      business_kind: "payment_collection",
      title: "中期进度款",
      description: null,
      position: {},
      config: { payment_type: "stage_2" },
      sort_order: 1,
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
    },
  ],
  edges: [],
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    getGraph,
  },
}));

describe("assertRuntimeNodeCompletionAllowed", () => {
  test("allows assigned finance to confirm payment collection without existing payment", async () => {
    const { assertRuntimeNodeCompletionAllowed } = await import(
      "./workflow-runtime-guards"
    );

    await expect(assertRuntimeNodeCompletionAllowed({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "payment_stage_2",
      output: { payment_status: "success" },
    })).resolves.toBeUndefined();
  });
});
