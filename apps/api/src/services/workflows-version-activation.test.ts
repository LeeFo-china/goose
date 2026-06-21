import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionRow,
  WorkflowVersionRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-21T00:00:00.000Z";

const assertTenantId = mock((_authContext: AuthContext) => "tenant-1");
const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);
const getDefinitionById = mock(async () => definition());
const getVersionById = mock(async (
  versionId: string,
  _definitionId: string,
  _tenantId: string,
) => version(versionId, versionId === "version-3" ? 3 : 2));
const updateActiveVersion = mock(async (input: {
  versionId: string | null;
}) => ({
  ...definition(),
  active_version_id: input.versionId,
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId,
    assertPermission,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    getVersionById,
    updateActiveVersion,
  },
}));

describe("workflowService.activateVersion", () => {
  beforeEach(() => {
    assertTenantId.mockClear();
    assertPermission.mockClear();
    getDefinitionById.mockClear();
    getDefinitionById.mockImplementation(async () => definition());
    getVersionById.mockClear();
    getVersionById.mockImplementation(async (
      versionId: string,
      _definitionId: string,
      _tenantId: string,
    ) => version(versionId, versionId === "version-3" ? 3 : 2));
    updateActiveVersion.mockClear();
    updateActiveVersion.mockImplementation(async (input: {
      versionId: string | null;
    }) => ({
      ...definition(),
      active_version_id: input.versionId,
    }));
  });

  test("marks a published workflow version as the active version", async () => {
    const { workflowService } = await import("./workflows");

    const result = await workflowService.activateVersion(
      authContext(),
      "definition-1",
      "version-2",
    );

    expect(updateActiveVersion).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      versionId: "version-2",
      status: "active",
      updatedBy: "employee-1",
    });
    expect(result.active_version_id).toBe("version-2");
  });

  test("rejects activating an archived workflow version", async () => {
    getVersionById.mockImplementation(async () => ({
      ...version("version-2", 2),
      status: "deprecated",
    }));
    const { workflowService } = await import("./workflows");

    await expect(workflowService.activateVersion(
      authContext(),
      "definition-1",
      "version-2",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_VERSION_ACTIVATE_FORBIDDEN",
    });
    expect(updateActiveVersion).not.toHaveBeenCalled();
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
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: "construction_main",
    name: "项目施工主流程",
    description: null,
    category: "construction",
    status: "active",
    active_version_id: "version-3",
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function version(id: string, versionNumber: number): WorkflowVersionRow {
  return {
    id,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_number: versionNumber,
    version_label: null,
    status: "published",
    snapshot: {},
    validation_result: {},
    published_by: null,
    published_at: NOW,
    created_at: NOW,
  };
}
