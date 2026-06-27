import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionBindingRow,
  WorkflowDefinitionRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-27T00:00:00.000Z";

const assertTenantContext = mock((_authContext: AuthContext) => "tenant-1");
const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);
const listDefinitions = mock(async () => ({
  list: [
    definition({
      id: "construction-custom",
      workflow_key: "fitout_flow",
    }),
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const listProjectConstructionBindingsByDefinitionIds = mock(async () => [
  binding(),
]);

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    assertPermission,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    listDefinitions,
    listProjectConstructionBindingsByDefinitionIds,
  },
}));

describe("listWorkflowDefinitions", () => {
  beforeEach(() => {
    assertTenantContext.mockClear();
    assertPermission.mockClear();
    listDefinitions.mockClear();
    listDefinitions.mockImplementation(async () => ({
      list: [
        definition({
          id: "construction-custom",
          workflow_key: "fitout_flow",
        }),
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    }));
    listProjectConstructionBindingsByDefinitionIds.mockClear();
    listProjectConstructionBindingsByDefinitionIds.mockImplementation(async () => [
      binding(),
    ]);
  });

  test("attaches construction binding to any construction category definition", async () => {
    const { listWorkflowDefinitions } = await import(
      "./workflows/definition-list"
    );

    const result = await listWorkflowDefinitions(authContext(), {
      page: 1,
      pageSize: 20,
    });

    expect(listProjectConstructionBindingsByDefinitionIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionIds: ["construction-custom"],
    });
    expect(result.list[0]?.project_construction_binding?.is_default).toBe(true);
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
  id: string;
  workflow_key: string;
}): WorkflowDefinitionRow {
  return {
    id: input.id,
    tenant_id: "tenant-1",
    workflow_key: input.workflow_key,
    name: input.workflow_key,
    description: null,
    category: "construction",
    status: "active",
    active_version_id: `${input.id}-version`,
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function binding(): WorkflowDefinitionBindingRow {
  return {
    id: "binding-1",
    tenant_id: "tenant-1",
    subject_type: "project",
    workflow_purpose: "construction",
    definition_id: "construction-custom",
    selectable: true,
    is_default: true,
    created_at: NOW,
    updated_at: NOW,
  };
}
