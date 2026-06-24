import { describe, expect, mock, test } from "bun:test";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let bundleResolved = false;
let workflowStartedBeforeBundleResolved = false;

const getEmployeeProjectBootstrapBundle = mock(async () => {
  await sleep(20);
  bundleResolved = true;
  return {
    project: {
      id: "project-1",
      tenant_id: "tenant-1",
      name: "测试项目",
      customer: null,
    },
    members: [],
    acceptance_rows: [],
    log_stage_rows: [],
    latest_log_rows: [],
    logs: {
      rows: [],
      has_more: false,
      comment_counts: [],
    },
  };
});

const getProjectProgress = mock(async () => {
  workflowStartedBeforeBundleResolved = !bundleResolved;
  return {
    source: "workflow_runtime",
    instance_id: "instance-1",
    instance_status: "running",
    current_node_key: "procedure_woodwork",
    current_node_title: "木工",
    current_group_key: "construction",
    current_group_label: "施工阶段",
    current_group_order: 20,
    current_node_type: "procedure",
    current_business_kind: "procedure_template",
    current_stage_code: "woodwork",
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 1,
    actions: [],
    warnings: [],
  };
});

mock.module("./shared", () => ({
  projectSer: {
    getEmployeeProjectBootstrapBundle,
    serializeProjectStoredMembers: mock(() => []),
    buildProjectMembersForDetail: mock(() => []),
    buildProjectConstructionStagesForBootstrapData: mock(async () => ({
      current_stage: null,
      next_stage: null,
      stages: [],
      missing_required_stages: [],
    })),
  },
  projectLogService: {},
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE: "completion",
  isProjectStatus: mock(() => true),
}));

mock.module("@/services/project-workflow-progress", () => ({
  buildUnavailableProjectWorkflowProgress: mock(() => ({
    source: "unavailable",
    instance_id: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    current_group_key: null,
    current_group_label: null,
    current_group_order: null,
    current_node_type: null,
    current_business_kind: null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 0,
    actions: [],
    warnings: [],
  })),
  enrichProjectWorkflowProgressWithConstructionStages: mock((progress) => progress),
  enrichWorkflowTimelineNodesWithConstructionStages: mock((nodes) => nodes),
  projectWorkflowProgressService: {
    getProjectProgress,
  },
}));

mock.module("@/services/workflow-subjects", () => ({
  workflowSubjectsService: {
    loadAccessibleActions: mock(async () => []),
    getState: mock(async () => ({
      workflow_state: {
        subject_type: "project",
        subject_id: "project-1",
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_woodwork",
        current_node_title: "木工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
        actions: [],
        timeline_nodes: [],
      },
    })),
  },
}));

describe("employee project detail bootstrap orchestration", () => {
  test("starts workflow progress while bootstrap bundle is still loading", async () => {
    bundleResolved = false;
    workflowStartedBeforeBundleResolved = false;
    getEmployeeProjectBootstrapBundle.mockClear();
    getProjectProgress.mockClear();

    const { getBootstrap } = await import("./orchestration");
    const timings = {
      bootstrap_data_ms: 0,
      project_ms: 0,
      permissions_ms: 0,
      members_ms: 0,
      workflow_progress_ms: 0,
      workflow_actions_ms: 0,
      workflow_state_ms: 0,
      construction_stages_ms: 0,
      logs_ms: 0,
      calendar_ms: 0,
    };
    const context = {
      createEmptyTimings: () => timings,
      measure: async (step: keyof typeof timings, target: typeof timings, loader: () => Promise<unknown>) => {
        const startedAt = Date.now();
        try {
          return await loader();
        } finally {
          target[step] = Date.now() - startedAt;
        }
      },
      buildPermissionsFromKnownData: mock(async () => ({
        employee_id: "employee-1",
        can_read_project: true,
        can_update_project: true,
        can_manage_project_team: true,
        can_create_project_log: true,
        can_access_project_acceptance: true,
        can_view_project_referral: false,
        can_manage_project_referral: false,
        internal_can_create_acceptance: true,
        internal_can_manage_acceptance: true,
        scopes: {
          project_update: "all",
          project_log_create: "all",
          project_acceptance_manage: "all",
        },
      })),
      toPublicPermissions: (permissions: unknown) => permissions,
      completePermissionsByStages: (permissions: unknown) => permissions,
      buildLogsFromBundle: mock(() => ({
        rows: [],
        pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
        commentSummaries: new Map(),
      })),
      buildWorkflowBlockingReason: mock(() => null),
      buildNextAction: mock(() => null),
      buildProjectLogEntry: mock(() => ({
        can_create: true,
        writable_stage: null,
        blocked_reason: null,
        next_action: null,
      })),
      toPartialError: mock(() => ({
        module: "workflow_progress",
        code: null,
        message: "failed",
      })),
    };

    await getBootstrap.call(context, {
      authContext: {
        tenantId: "tenant-1",
        employeeId: "employee-1",
        permissions: [{ code: "project.read", scope: "all" }],
        roleCodes: [],
      },
      projectId: "project-1",
      query: {
        log_page_size: 5,
        include_calendar: false,
        include_referral_summary: false,
        include_cameras_summary: false,
      },
    } as never);

    expect(workflowStartedBeforeBundleResolved).toBe(true);
  });
});
