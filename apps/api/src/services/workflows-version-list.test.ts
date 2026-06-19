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
const getVersionById = mock(async (
  versionId: string,
  _definitionId: string,
  _tenantId: string,
) => version(versionId, versionId === "version-3" ? 3 : 2));
const updateVersionStatus = mock(async (input: {
  id: string;
  status: "published" | "deprecated";
}) => ({
  ...version(input.id, input.id === "version-3" ? 3 : 2),
  status: input.status,
}));
const getRuntimeInstanceById = mock(async (
  _input: { tenantId: string; definitionId: string; instanceId: string },
) => runtimeInstance({
  id: "instance-1",
  status: "completed",
}));
const archiveRuntimeInstance = mock(async (
  input: {
    tenantId: string;
    definitionId: string;
    instanceId: string;
    archivedBy?: string | null;
    archiveReason?: string | null;
  },
) => runtimeInstance({
  id: input.instanceId,
  status: "completed",
  archived_at: NOW,
  archived_by: input.archivedBy ?? null,
  archive_reason: input.archiveReason ?? null,
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
    getRuntimeInstanceById,
    getVersionById,
    archiveRuntimeInstance,
    listVersions,
    listRunningInstanceCountsByVersion,
    updateVersionStatus,
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
    getVersionById.mockClear();
    getVersionById.mockImplementation(async (
      versionId: string,
      _definitionId: string,
      _tenantId: string,
    ) => version(versionId, versionId === "version-3" ? 3 : 2));
    updateVersionStatus.mockClear();
    updateVersionStatus.mockImplementation(async (input: {
      id: string;
      status: "published" | "deprecated";
    }) => ({
      ...version(input.id, input.id === "version-3" ? 3 : 2),
      status: input.status,
    }));
    getRuntimeInstanceById.mockClear();
    getRuntimeInstanceById.mockImplementation(async () => runtimeInstance({
      id: "instance-1",
      status: "completed",
    }));
    archiveRuntimeInstance.mockClear();
    archiveRuntimeInstance.mockImplementation(async (input) => runtimeInstance({
      id: input.instanceId,
      status: "completed",
      archived_at: NOW,
      archived_by: input.archivedBy ?? null,
      archive_reason: input.archiveReason ?? null,
    }));
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

  test("rejects archiving the active workflow version", async () => {
    const { workflowService } = await import("./workflows");

    await expect(workflowService.archiveVersion(
      authContext(),
      "definition-1",
      "version-3",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_ACTIVE_VERSION_ARCHIVE_FORBIDDEN",
    });
    expect(updateVersionStatus).not.toHaveBeenCalled();
  });

  test("rejects archiving a historical version that still has running instances", async () => {
    const { workflowService } = await import("./workflows");

    await expect(workflowService.archiveVersion(
      authContext(),
      "definition-1",
      "version-2",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_VERSION_RUNNING_INSTANCES",
    });
    expect(updateVersionStatus).not.toHaveBeenCalled();
  });

  test("marks an inactive version without running instances as deprecated", async () => {
    listRunningInstanceCountsByVersion.mockImplementation(async () => new Map());
    const { workflowService } = await import("./workflows");

    const result = await workflowService.archiveVersion(
      authContext(),
      "definition-1",
      "version-2",
    );

    expect(updateVersionStatus).toHaveBeenCalledWith({
      id: "version-2",
      definitionId: "definition-1",
      tenantId: "tenant-1",
      status: "deprecated",
    });
    expect(result.status).toBe("deprecated");
  });

  test("rejects archiving a runtime instance that is not completed", async () => {
    getRuntimeInstanceById.mockImplementation(async () => runtimeInstance({
      id: "instance-1",
      status: "running",
    }));
    const { workflowService } = await import("./workflows");

    await expect(workflowService.archiveRuntimeInstance(
      authContext(),
      "definition-1",
      "instance-1",
      { reason: "验收完成" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_INSTANCE_ARCHIVE_NOT_COMPLETED",
    });
    expect(archiveRuntimeInstance).not.toHaveBeenCalled();
  });

  test("archives a completed runtime instance without changing its completed status", async () => {
    const { workflowService } = await import("./workflows");

    const result = await workflowService.archiveRuntimeInstance(
      authContext(),
      "definition-1",
      "instance-1",
      { reason: "验收完成" },
    );

    expect(archiveRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      archivedBy: "employee-1",
      archiveReason: "验收完成",
    });
    expect(result.status).toBe("completed");
    expect(result.archived_at).toBe(NOW);
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
    status: "published",
    snapshot: {},
    validation_result: {},
    published_by: null,
    published_at: NOW,
    created_at: NOW,
  };
}

function runtimeInstance(input: {
  id: string;
  status: "running" | "completed" | "canceled" | "failed";
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
}) {
  return {
    id: input.id,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_id: "version-2",
    subject_type: "project",
    subject_id: "project-1",
    status: input.status,
    context: {},
    current_node_id: null,
    current_node_key: null,
    current_node_snapshot: null,
    started_by: null,
    completed_by: "employee-1",
    started_at: NOW,
    completed_at: input.status === "completed" ? NOW : null,
    archived_at: input.archived_at ?? null,
    archived_by: input.archived_by ?? null,
    archive_reason: input.archive_reason ?? null,
    created_at: NOW,
    updated_at: NOW,
  };
}
