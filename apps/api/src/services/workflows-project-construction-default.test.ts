import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionBindingRow,
  WorkflowDefinitionRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-27T00:00:00.000Z";

const assertTenantContext = mock((_authContext: AuthContext) => "tenant-1");
const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);
const getDefinitionById = mock(async () => definition());
const setDefaultProjectConstructionWorkflow = mock(async () => binding());

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    assertPermission,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    setDefaultProjectConstructionWorkflow,
  },
}));

describe("setProjectConstructionDefaultWorkflow", () => {
  beforeEach(() => {
    assertTenantContext.mockClear();
    assertPermission.mockClear();
    getDefinitionById.mockClear();
    getDefinitionById.mockImplementation(async () => definition());
    setDefaultProjectConstructionWorkflow.mockClear();
    setDefaultProjectConstructionWorkflow.mockImplementation(async () => binding());
  });

  test("allows a custom active construction workflow to become the default", async () => {
    const { setProjectConstructionDefaultWorkflow } = await import(
      "./workflows/project-construction-default"
    );

    const result = await setProjectConstructionDefaultWorkflow(
      authContext(),
      "construction-custom-1",
    );

    expect(getDefinitionById).toHaveBeenCalledWith(
      "construction-custom-1",
      "tenant-1",
    );
    expect(setDefaultProjectConstructionWorkflow).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "construction-custom-1",
    });
    expect(result.definition.workflow_key).toBe("construction_custom_mq7hqqgl_1_d0c5a149");
    expect(result.binding.is_default).toBe(true);
  });
});

function authContext(): AuthContext {
  return {
    tenantId: "tenant-1",
    employeeId: "employee-1",
    permissions: [{ code: "employee.permission_manage", scope: "all" }],
  } as AuthContext;
}

function definition(): WorkflowDefinitionRow {
  return {
    id: "construction-custom-1",
    tenant_id: "tenant-1",
    workflow_key: "construction_custom_mq7hqqgl_1_d0c5a149",
    name: "工程施工",
    description: null,
    category: "construction",
    status: "active",
    active_version_id: "version-7",
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
    definition_id: "construction-custom-1",
    selectable: true,
    is_default: true,
    created_at: NOW,
    updated_at: NOW,
  };
}
