import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowDefinitionRow,
  WorkflowVersionRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-19T00:00:00.000Z";

const assertTenantId = mock((_authContext: AuthContext) => "tenant-1");
const assertPermission = mock((_authContext: AuthContext, _permission: string) => undefined);

const getDefinitionById = mock(async () => definition());
const listVersions = mock(async () => ({
  list: [
    version("version-3", 3),
    version("version-2", 2),
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  },
}));
const listRunningInstanceCountsByVersion = mock(async () => new Map([
  ["version-2", 2],
  ["version-3", 1],
]));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId,
    assertPermission,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    listVersions,
    listRunningInstanceCountsByVersion,
  },
}));

describe("workflowService.listVersions", () => {
  beforeEach(() => {
    assertTenantId.mockClear();
    assertPermission.mockClear();
    getDefinitionById.mockClear();
    getDefinitionById.mockImplementation(async () => definition());
    listVersions.mockClear();
    listVersions.mockImplementation(async () => ({
      list: [
        version("version-3", 3),
        version("version-2", 2),
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      },
    }));
    listRunningInstanceCountsByVersion.mockClear();
    listRunningInstanceCountsByVersion.mockImplementation(async () => new Map([
      ["version-2", 2],
      ["version-3", 1],
    ]));
  });

  test("marks active version and attaches running instance counts", async () => {
    const { workflowService } = await import("./workflows");

    const result = await workflowService.listVersions(
      {} as AuthContext,
      "definition-1",
      { page: 1, pageSize: 20 },
    );

    expect(listVersions).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      page: 1,
      pageSize: 20,
    });
    expect(listRunningInstanceCountsByVersion).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      versionIds: ["version-3", "version-2"],
    });
    expect(result).toMatchObject({
      list: [
        {
          id: "version-3",
          version_number: 3,
          is_active: true,
          running_instance_count: 1,
        },
        {
          id: "version-2",
          version_number: 2,
          is_active: false,
          running_instance_count: 2,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      },
    });
  });
});

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
    status: "published",
    snapshot: {},
    validation_result: {},
    published_by: null,
    published_at: NOW,
    created_at: NOW,
  };
}
