import { describe, expect, mock, test } from "bun:test";

const projectId = "2d710a84-1045-4750-8dfd-51a0f463a4db";
const customerId = "customer-1";
const tenantId = "tenant-1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const workflowProgress = {
  source: "workflow_runtime",
  instance_id: "instance-1",
  instance_status: "running",
  current_node_key: "final_acceptance",
  current_node_title: "竣工验收",
  current_node_type: "confirmation",
  current_business_kind: "final_acceptance",
  current_stage_code: null,
  current_gate: null,
  timeline_nodes: [
    {
      node_key: "final_acceptance",
      node_title: "竣工验收",
      node_type: "confirmation",
      business_kind: "final_acceptance",
      status: "current",
    },
  ],
  pending_task_count: 0,
  actions: [],
  warnings: [],
};

const getOwnedProject = mock(async () => ({
  id: projectId,
  tenant_id: tenantId,
  name: "测试项目",
  status: "constructing",
  budget: null,
  address: "测试地址",
  property_id: null,
  start_date: null,
  style_tags: [],
  designer: null,
  property: null,
  workflow_state: null,
}));

const listCustomerProjectConstructionStages = mock(async () => ({
  current_stage: null,
  next_stage: null,
  stages: [
    {
      stage_code: "completion",
      stage_label: "竣工",
      status: "available",
    },
  ],
  missing_required_stages: [],
}));

mock.module("@/services/customer-project-detail", () => ({
  customerProjectDetailService: {
    getOwnedProject,
  },
}));

mock.module("@/services/customer-project-detail-logs", () => ({
  customerProjectDetailLogsService: {
    listLogs: mock(async () => []),
  },
}));

mock.module("@/services/customer-service-config", () => ({
  customerServiceConfigService: {
    getCustomerServiceConfig: mock(async () => null),
  },
}));

mock.module("@/services/project-members", () => ({
  projectMemberService: {
    listProjectMembers: mock(async () => []),
  },
}));

mock.module("@/services/project-workflow-progress", () => ({
  buildUnavailableProjectWorkflowProgress: () => ({
    source: "unavailable",
    instance_id: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    current_node_type: null,
    current_business_kind: null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 0,
    actions: [],
    warnings: [],
  }),
  projectWorkflowProgressService: {
    getProjectProgress: mock(async () => {
      await sleep(1_900);
      return workflowProgress;
    }),
  },
  toCustomerProjectWorkflowProgress: (progress: unknown) => progress,
}));

mock.module("@/services/project-acceptances", () => ({
  projectAcceptanceService: {
    listCustomerAcceptances: mock(async () => ({ list: [], pagination: {} })),
  },
}));

mock.module("@/services/construction-stage-status", () => ({
  constructionStageStatusService: {
    listCustomerProjectConstructionStages,
    listProjectConstructionStagesForProject: mock(async () => null),
  },
}));

mock.module("@/services/customer-campaign-bootstrap", () => ({
  customerCampaignBootstrapService: {
    hasShareAssistEntry: mock(async () => false),
  },
}));

mock.module("@/services/customer-project-log-shares", () => ({
  customerProjectLogShareService: {
    getCustomerProjectCampaignSummary: mock(async () => null),
    getCustomerProjectAppointmentRewardCampaign: mock(async () => null),
  },
}));

describe("customer project detail bootstrap construction stages timeout", () => {
  test("does not count waiting for workflow progress against construction stages timeout", async () => {
    const { default: controller } = await import("./detail-bootstrap-controller");
    const testController = controller as unknown as {
      getCustomerProjectDetailBootstrap: (request: unknown) => Promise<{
        data: {
          construction_stages?: { stages: Array<{ stage_code: string }> } | null;
          partial_errors: Array<{ module: string }>;
          workflow_progress: { source: string };
        };
      }>;
      getRequiredAuthUserId: () => Promise<string>;
      getCustomerProfileFromRequest: () => Promise<{ id: string; tenant_id: string }>;
    };

    testController.getRequiredAuthUserId = async () => "auth-user-1";
    testController.getCustomerProfileFromRequest = async () => ({
      id: customerId,
      tenant_id: tenantId,
    });

    const response = await testController.getCustomerProjectDetailBootstrap({
      params: { id: projectId },
      query: {
        include_acceptances: false,
        include_stages: true,
        include_campaigns: false,
      },
      user: {
        tenant_id: tenantId,
        customer_id: customerId,
      },
      id: "req-test",
      log: {
        info: mock(() => undefined),
        warn: mock(() => undefined),
      },
    });

    expect(response.data.workflow_progress.source).toBe("workflow_runtime");
    expect(response.data.construction_stages?.stages).toHaveLength(1);
    expect(response.data.partial_errors.some((item) =>
      item.module === "construction_stages"
    )).toBe(false);
    expect(listCustomerProjectConstructionStages).toHaveBeenCalledWith({
      projectId,
      tenantId,
      customerId,
      workflowProgress,
    });
  });
});
