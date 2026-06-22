import { describe, expect, mock, test } from "bun:test";

type RuntimeProjectionFixture = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_id: string;
  subject_type: "project";
  subject_id: string;
  status: "running" | "completed";
  current_node_key: string;
  current_node_snapshot: {
    title: string;
    business_kind: string | null;
  };
  started_at: string;
  created_at: string;
  updated_at: string;
};

const latestRuntimeInstance: RuntimeProjectionFixture = {
  id: "instance-new",
  tenant_id: "tenant-1",
  definition_id: "definition-new",
  version_id: "version-new",
  subject_type: "project",
  subject_id: "project-1",
  status: "running",
  current_node_key: "final_acceptance",
  current_node_snapshot: {
    title: "竣工验收",
    business_kind: "final_acceptance",
  },
  started_at: "2026-06-14T11:20:53.492Z",
  created_at: "2026-06-14T11:20:53.492Z",
  updated_at: "2026-06-15T16:20:04.646Z",
};

const completedRuntimeInstance: RuntimeProjectionFixture = {
  ...latestRuntimeInstance,
  id: "instance-completed",
  status: "completed",
  current_node_key: "end",
  current_node_snapshot: {
    title: "结束",
    business_kind: null,
  },
};

const find = mock(async () => ({
  id: "state-1",
  tenant_id: "tenant-1",
  subject_type: "project",
  subject_id: "project-1",
  definition_id: "definition-old",
  instance_id: "instance-old",
  instance_status: "running",
  current_node_key: "constructing",
  current_node_title: "施工中",
  current_business_kind: "procedure_template",
  pending_task_count: 1,
  created_at: "2026-06-13T13:49:45.894Z",
  updated_at: "2026-06-16T03:32:42.281Z",
}));

const findLatestRuntimeInstance = mock(async () => latestRuntimeInstance);
const countPendingTasks = mock(async () => 1);
const upsert = mock(async (input: Record<string, unknown>) => ({
  id: "state-1",
  tenant_id: input.tenantId,
  subject_type: input.subjectType,
  subject_id: input.subjectId,
  definition_id: input.definitionId,
  instance_id: input.instanceId,
  instance_status: input.instanceStatus,
  current_node_key: input.currentNodeKey,
  current_node_title: input.currentNodeTitle,
  current_business_kind: input.currentBusinessKind,
  pending_task_count: input.pendingTaskCount,
  created_at: "2026-06-13T13:49:45.894Z",
  updated_at: "2026-06-16T03:32:42.281Z",
}));

mock.module("@/repositories/workflow-subject-states", () => ({
  workflowSubjectStateRepository: {
    find,
    findLatestRuntimeInstance,
    countPendingTasks,
    upsert,
  },
}));

describe("workflowSubjectStateService", () => {
  test("refreshes an existing stale subject projection from the authoritative runtime instance", async () => {
    find.mockClear();
    findLatestRuntimeInstance.mockClear();
    countPendingTasks.mockClear();
    upsert.mockClear();

    const { workflowSubjectStateService } = await import(
      "./workflow-subject-state"
    );

    const state = await workflowSubjectStateService.getSubjectState({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(state?.instance_id).toBe("instance-new");
    expect(state?.current_node_key).toBe("final_acceptance");
    expect(upsert).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      definitionId: "definition-new",
      instanceId: "instance-new",
      instanceStatus: "running",
      currentNodeKey: "final_acceptance",
      currentNodeTitle: "竣工验收",
      currentBusinessKind: "final_acceptance",
      pendingTaskCount: 1,
    });
  });

  test("keeps completed runtime projection for read-only workflow display", async () => {
    find.mockClear();
    findLatestRuntimeInstance.mockClear();
    findLatestRuntimeInstance.mockImplementationOnce(async () =>
      completedRuntimeInstance
    ).mockImplementationOnce(async () => completedRuntimeInstance);
    countPendingTasks.mockClear();
    countPendingTasks.mockImplementationOnce(async () => 0);
    upsert.mockClear();

    const { workflowSubjectStateService } = await import(
      "./workflow-subject-state"
    );

    const state = await workflowSubjectStateService.getSubjectState({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(state?.instance_id).toBe("instance-completed");
    expect(state?.instance_status).toBe("completed");
    expect(state?.current_node_key).toBe("end");
    expect(state?.pending_task_count).toBe(0);
    expect(upsert).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      definitionId: "definition-new",
      instanceId: "instance-completed",
      instanceStatus: "completed",
      currentNodeKey: "end",
      currentNodeTitle: "结束",
      currentBusinessKind: null,
      pendingTaskCount: 0,
    });
  });
});
