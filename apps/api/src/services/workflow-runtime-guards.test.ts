import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionRow,
  WorkflowGraphResult,
  WorkflowInstanceRow,
  WorkflowNodeRow,
} from "@/repositories/workflows";

const NOW = "2026-06-15T00:00:00.000Z";

function paymentInstance(): WorkflowInstanceRow {
  return {
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
    started_at: NOW,
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function procedureInstance(): WorkflowInstanceRow {
  return {
    ...paymentInstance(),
    current_node_id: "node-procedure",
    current_node_key: "procedure_plumbing_electrical",
    current_node_snapshot: procedureNode(),
  };
}

function definition(category: WorkflowDefinitionRow["category"]): WorkflowDefinitionRow {
  return {
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: "project_workflow",
    name: "项目流程",
    description: null,
    category,
    status: "active",
    active_version_id: "version-1",
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function paymentNode(): WorkflowNodeRow {
  return {
    id: "node-payment",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: "payment_stage_2",
    node_type: "confirmation",
    business_kind: "payment_collection",
    title: "中期进度款",
    description: null,
    position: { x: 0, y: 0 },
    config: { payment_type: "stage_2" },
    sort_order: 1,
    created_at: NOW,
    updated_at: NOW,
  };
}

function procedureNode(): WorkflowNodeRow {
  return {
    id: "node-procedure",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: "procedure_plumbing_electrical",
    node_type: "procedure",
    business_kind: "procedure_template",
    title: "水电",
    description: null,
    position: { x: 0, y: 0 },
    config: {
      stage_key: "plumbing_electrical",
      require_log: true,
      min_image_count: 2,
    },
    sort_order: 1,
    created_at: NOW,
    updated_at: NOW,
  };
}

function paymentGraph(): WorkflowGraphResult {
  return {
    definition: definition("main"),
    version: null,
    nodes: [paymentNode()],
    edges: [],
  };
}

function constructionProcedureGraph(): WorkflowGraphResult {
  return {
    definition: definition("construction"),
    version: null,
    nodes: [procedureNode()],
    edges: [],
  };
}

const getRuntimeInstanceById = mock(async () => paymentInstance());

const getGraph = mock(async () => paymentGraph());

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    getGraph,
  },
}));

describe("assertRuntimeNodeCompletionAllowed", () => {
  beforeEach(() => {
    getRuntimeInstanceById.mockClear();
    getRuntimeInstanceById.mockImplementation(async () => paymentInstance());
    getGraph.mockClear();
    getGraph.mockImplementation(async () => paymentGraph());
  });

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

  test("rejects construction procedure completion when required log and images are missing", async () => {
    getRuntimeInstanceById.mockImplementationOnce(async () => procedureInstance());
    getGraph.mockImplementationOnce(async () => constructionProcedureGraph());

    const { assertRuntimeNodeCompletionAllowed } = await import(
      "./workflow-runtime-guards"
    );

    await expect(assertRuntimeNodeCompletionAllowed({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "procedure_plumbing_electrical",
      output: {},
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED",
      message: "工序节点要求未满足：需要关联施工日志，至少需要 2 张施工图片",
      details: {
        node_key: "procedure_plumbing_electrical",
        require_log: true,
        min_image_count: 2,
        image_count: 0,
      },
    });
  });

  test("rejects construction procedure completion when image count is below the node requirement", async () => {
    getRuntimeInstanceById.mockImplementationOnce(async () => procedureInstance());
    getGraph.mockImplementationOnce(async () => constructionProcedureGraph());

    const { assertRuntimeNodeCompletionAllowed } = await import(
      "./workflow-runtime-guards"
    );

    await expect(assertRuntimeNodeCompletionAllowed({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "procedure_plumbing_electrical",
      output: {
        project_log_id: "log-1",
        images: ["image-1"],
      },
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED",
      message: "工序节点要求未满足：至少需要 2 张施工图片",
      details: {
        node_key: "procedure_plumbing_electrical",
        require_log: true,
        min_image_count: 2,
        image_count: 1,
      },
    });
  });

  test("allows construction procedure completion when required log and images are provided", async () => {
    getRuntimeInstanceById.mockImplementationOnce(async () => procedureInstance());
    getGraph.mockImplementationOnce(async () => constructionProcedureGraph());

    const { assertRuntimeNodeCompletionAllowed } = await import(
      "./workflow-runtime-guards"
    );

    await expect(assertRuntimeNodeCompletionAllowed({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "procedure_plumbing_electrical",
      output: {
        project_log_id: "log-1",
        image_count: 2,
      },
    })).resolves.toBeUndefined();
  });
});
