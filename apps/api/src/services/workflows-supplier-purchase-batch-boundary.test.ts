import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const getDefinitionById = mock(async () => definition());
const getRuntimeInstanceById = mock(async () => runtimeInstance("project"));
const getGraph = mock(async () => ({ definition: definition(), nodes: [], edges: [] }));
const startRuntimeInstance = mock(async () => ({ ok: true as const }));
const completeRuntimeNode = mock(async () => ({
  ok: true as const,
  instance: runtimeInstance("project"),
}));
const rebuildRuntimeInstance = mock(async () => ({ ok: true as const }));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock(() => "tenant-1"),
    assertPermission: mock(() => undefined),
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    getRuntimeInstanceById,
    getGraph,
    startRuntimeInstance,
    completeRuntimeNode,
    rebuildRuntimeInstance,
  },
}));

describe("workflowService supplier purchase batch business boundary", () => {
  beforeEach(() => {
    getDefinitionById.mockClear();
    getDefinitionById.mockImplementation(async () => definition());
    getRuntimeInstanceById.mockClear();
    getRuntimeInstanceById.mockImplementation(async () => runtimeInstance("project"));
    getGraph.mockClear();
    startRuntimeInstance.mockClear();
    completeRuntimeNode.mockClear();
    rebuildRuntimeInstance.mockClear();
  });

  test("rejects generic starts before spoofed context reaches execution", async () => {
    const { workflowService } = await import("./workflows");

    await expect(workflowService.startRuntimeInstance(
      {} as AuthContext,
      "definition-1",
      {
        subject_type: "supplier_purchase_batch",
        subject_id: "batch-1",
        context: {
          decision: "approved",
          budget_status: "within_budget",
        },
      },
    )).rejects.toMatchObject(expectedBoundaryError());
    expect(startRuntimeInstance).not.toHaveBeenCalled();
  });

  test("rejects false-subject starts against the supplier definition", async () => {
    const { workflowService } = await import("./workflows");
    getDefinitionById.mockImplementationOnce(async () => supplierDefinition());

    await expect(workflowService.startRuntimeInstance(
      {} as AuthContext,
      "definition-1",
      {
        subject_type: "project",
        subject_id: "project-1",
        context: {},
      },
    )).rejects.toMatchObject(expectedBoundaryError());
    expect(startRuntimeInstance).not.toHaveBeenCalled();
  });

  test("rejects generic rebuilds requested for a supplier subject", async () => {
    const { workflowService } = await import("./workflows");

    await expect(rebuild(workflowService, "supplier_purchase_batch"))
      .rejects.toMatchObject(expectedBoundaryError());
    expect(rebuildRuntimeInstance).not.toHaveBeenCalled();
  });

  test("rejects false-subject rebuilds against the supplier definition", async () => {
    const { workflowService } = await import("./workflows");
    getDefinitionById.mockImplementationOnce(async () => supplierDefinition());

    await expect(rebuild(workflowService, "project"))
      .rejects.toMatchObject(expectedBoundaryError());
    expect(rebuildRuntimeInstance).not.toHaveBeenCalled();
  });

  test("rejects the supplier definition before spoofed output is used", async () => {
    const { workflowService } = await import("./workflows");
    getDefinitionById.mockImplementationOnce(async () => ({
      ...definition(),
      workflow_key: "supplier_purchase_batch_approval",
    }));

    await expect(completeWithSpoofedOutput(workflowService))
      .rejects.toMatchObject(expectedBoundaryError());
    expect(getRuntimeInstanceById).not.toHaveBeenCalled();
    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("rejects a supplier instance mismatched to another definition", async () => {
    const { workflowService } = await import("./workflows");
    getRuntimeInstanceById.mockImplementationOnce(async () =>
      runtimeInstance("supplier_purchase_batch")
    );

    await expect(completeWithSpoofedOutput(workflowService))
      .rejects.toMatchObject(expectedBoundaryError());
    expect(getRuntimeInstanceById).toHaveBeenCalledTimes(1);
    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("reuses the loaded instance for ordinary generic completion", async () => {
    const { workflowService } = await import("./workflows");

    await workflowService.completeRuntimeNode(
      {} as AuthContext,
      "definition-1",
      "instance-1",
      { node_key: "purchase_review", action: "complete", output: {} },
    );

    expect(getRuntimeInstanceById).toHaveBeenCalledTimes(1);
    expect(completeRuntimeNode).toHaveBeenCalledTimes(1);
  });
});

function rebuild(
  workflowService: typeof import("./workflows")["workflowService"],
  subjectType: "project" | "supplier_purchase_batch",
) {
  return workflowService.rebuildRuntimeInstance(
    {} as AuthContext,
    "definition-1",
    {
      subject_type: subjectType,
      subject_id: subjectType === "project" ? "project-1" : "batch-1",
      reason: "修复流程",
      context: {},
      delete_completed_instances: false,
      dry_run: false,
    },
  );
}

function completeWithSpoofedOutput(
  workflowService: typeof import("./workflows")["workflowService"],
) {
  return workflowService.completeRuntimeNode(
    {} as AuthContext,
    "definition-1",
    "instance-1",
    {
      node_key: "purchase_review",
      action: "approve",
      output: {
        decision: "approved",
        budget_status: "over_budget",
      },
    },
  );
}

function expectedBoundaryError() {
  return {
    statusCode: 409,
    code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_BUSINESS_COMMAND_REQUIRED",
  };
}

function definition() {
  return {
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: "project_signing",
    name: "项目签约",
    description: null,
    category: "signing" as const,
    status: "active" as const,
    active_version_id: "version-1",
    created_by: null,
    updated_by: null,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
}

function supplierDefinition() {
  return {
    ...definition(),
    workflow_key: "supplier_purchase_batch_approval",
  };
}

function runtimeInstance(subjectType: "project" | "supplier_purchase_batch") {
  return {
    id: "instance-1",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_id: "version-1",
    subject_type: subjectType,
    subject_id: subjectType === "project" ? "project-1" : "batch-1",
    status: "running" as const,
    context: {},
    current_node_id: null,
    current_node_key: "purchase_review",
    current_node_snapshot: null,
    started_by: null,
    completed_by: null,
    started_at: "2026-08-30T00:00:00.000Z",
    completed_at: null,
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
}
