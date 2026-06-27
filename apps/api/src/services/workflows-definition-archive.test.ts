import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionBindingRow,
  WorkflowDefinitionRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-27T00:00:00.000Z";

const assertTenantId = mock((_authContext: AuthContext) => "tenant-1");
const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);
const getDefinitionById = mock(async () => definition());
const updateDefinition = mock(async (
  _id: string,
  _tenantId: string,
  input: { status?: string; updatedBy?: string | null },
) => ({
  ...definition(),
  status: input.status ?? "active",
  updated_by: input.updatedBy ?? null,
}));
const listProjectConstructionBindingsByDefinitionIds = mock(async () => [
  binding({ is_default: false }),
]);
const updateProjectConstructionWorkflowCandidate = mock(async () =>
  binding({ selectable: false, is_default: false })
);

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId,
    assertPermission,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    updateDefinition,
    listProjectConstructionBindingsByDefinitionIds,
    updateProjectConstructionWorkflowCandidate,
  },
}));

mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(() => undefined),
}));

mock.module("@/services/workflow-publish-graph", () => ({
  buildWorkflowSnapshot: mock(() => ({})),
  validateWorkflowPublishGraph: mock(() => ({})),
}));

describe("workflowService.archiveDefinition", () => {
  beforeEach(() => {
    assertTenantId.mockClear();
    assertPermission.mockClear();
    getDefinitionById.mockClear();
    getDefinitionById.mockImplementation(async () => definition());
    updateDefinition.mockClear();
    updateDefinition.mockImplementation(async (
      _id: string,
      _tenantId: string,
      input: { status?: string; updatedBy?: string | null },
    ) => ({
      ...definition(),
      status: input.status ?? "active",
      updated_by: input.updatedBy ?? null,
    }));
    listProjectConstructionBindingsByDefinitionIds.mockClear();
    listProjectConstructionBindingsByDefinitionIds.mockImplementation(async () => [
      binding({ is_default: false }),
    ]);
    updateProjectConstructionWorkflowCandidate.mockClear();
    updateProjectConstructionWorkflowCandidate.mockImplementation(async () =>
      binding({ selectable: false, is_default: false })
    );
  });

  test("rejects archiving the default project construction workflow", async () => {
    listProjectConstructionBindingsByDefinitionIds.mockImplementation(async () => [
      binding({ is_default: true }),
    ]);
    const { workflowService } = await import("./workflows");

    await expect(workflowService.archiveDefinition(
      authContext(),
      "construction-main",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_PROJECT_CONSTRUCTION_DEFAULT_ARCHIVE_FORBIDDEN",
    });
    expect(updateDefinition).not.toHaveBeenCalled();
    expect(updateProjectConstructionWorkflowCandidate).not.toHaveBeenCalled();
  });

  test("removes a non-default project construction candidate when archiving it", async () => {
    const { workflowService } = await import("./workflows");

    const result = await workflowService.archiveDefinition(
      authContext(),
      "construction-custom",
    );

    expect(updateProjectConstructionWorkflowCandidate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "construction-custom",
      selectable: false,
      isDefault: false,
    });
    expect(updateDefinition).toHaveBeenCalledWith("construction-custom", "tenant-1", {
      status: "archived",
      updatedBy: "employee-1",
    });
    expect(result.status).toBe("archived");
  });

  test("archives a non-construction workflow without touching construction candidates", async () => {
    getDefinitionById.mockImplementation(async () => definition({
      id: "customer-main",
      category: "sales",
    }));
    const { workflowService } = await import("./workflows");

    const result = await workflowService.archiveDefinition(
      authContext(),
      "customer-main",
    );

    expect(listProjectConstructionBindingsByDefinitionIds).not.toHaveBeenCalled();
    expect(updateProjectConstructionWorkflowCandidate).not.toHaveBeenCalled();
    expect(result.status).toBe("archived");
  });
});

function authContext(): AuthContext {
  return {
    tenantId: "tenant-1",
    employeeId: "employee-1",
    permissions: [{ code: "employee.permission_manage", scope: "all" }],
  } as AuthContext;
}

function definition(input: {
  id?: string;
  category?: WorkflowDefinitionRow["category"];
} = {}): WorkflowDefinitionRow {
  return {
    id: input.id ?? "construction-custom",
    tenant_id: "tenant-1",
    workflow_key: input.id ?? "construction_custom_mq7hqqgl_1_d0c5a149",
    name: "工程施工",
    description: null,
    category: input.category ?? "construction",
    status: "active",
    active_version_id: "version-7",
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function binding(input: {
  selectable?: boolean;
  is_default?: boolean;
} = {}): WorkflowDefinitionBindingRow {
  return {
    id: "binding-1",
    tenant_id: "tenant-1",
    subject_type: "project",
    workflow_purpose: "construction",
    definition_id: "construction-custom",
    selectable: input.selectable ?? true,
    is_default: input.is_default ?? false,
    created_at: NOW,
    updated_at: NOW,
  };
}
