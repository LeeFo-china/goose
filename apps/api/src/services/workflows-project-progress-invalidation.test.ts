import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { projectWorkflowProgressService } from "@/services/project-workflow-progress";

const instance = {
  id: "instance-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  version_id: "version-1",
  subject_type: "project",
  subject_id: "project-1",
  status: "running",
  context: {},
  current_node_id: "node-2",
  current_node_key: "procedure_installation",
  current_node_snapshot: {},
  started_by: "employee-1",
  completed_by: null,
  started_at: "2026-07-10T00:00:00.000Z",
  completed_at: null,
  archived_at: null,
  archived_by: null,
  archive_reason: null,
  created_at: "2026-07-10T00:00:00.000Z",
  updated_at: "2026-07-10T00:00:00.000Z",
};
const getDefinitionById = mock(async () => ({ id: "definition-1" }));
const startRuntimeInstance = mock(async () => ({
  ok: true as const, instance, currentNode: {}, task: null,
}));
const completeRuntimeNode = mock(async () => ({
  ok: true as const, instance, completedNode: {}, nextNode: null, task: null,
}));
const rebuildRuntimeInstance = mock(async () => ({
  ok: true as const, instance, archivedInstanceIds: [], dryRun: false,
}));
const invalidateProjectProgress = spyOn(projectWorkflowProgressService, "invalidateProject")
  .mockImplementation(() => undefined);

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock(() => "tenant-1"),
    assertPermission: mock(() => undefined),
  },
}));
mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(async () => undefined),
}));
mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById,
    startRuntimeInstance,
    completeRuntimeNode,
    rebuildRuntimeInstance,
  },
}));

const authContext = {} as AuthContext;

describe("workflowService project progress invalidation", () => {
  beforeEach(() => invalidateProjectProgress.mockClear());

  test("invalidates after starting a project runtime", async () => {
    const { workflowService } = await import("./workflows");
    await workflowService.startRuntimeInstance(authContext, "definition-1", {
      subject_type: "project", subject_id: "project-1", context: {},
    });
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("invalidates after completing a project runtime node", async () => {
    const { workflowService } = await import("./workflows");
    await workflowService.completeRuntimeNode(authContext, "definition-1", "instance-1", {
      node_key: "procedure_installation", action: "complete", output: {},
    });
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("invalidates an applied rebuild but not a dry run", async () => {
    const { workflowService } = await import("./workflows");
    const base = {
      subject_type: "project" as const,
      subject_id: "project-1",
      reason: "修复流程",
      context: {},
      delete_completed_instances: false,
    };
    await workflowService.rebuildRuntimeInstance(authContext, "definition-1", {
      ...base, dry_run: true,
    });
    expect(invalidateProjectProgress).not.toHaveBeenCalled();

    await workflowService.rebuildRuntimeInstance(authContext, "definition-1", {
      ...base, dry_run: false,
    });
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });
});
