import { describe, expect, mock, test } from "bun:test";

const projectId = "2d710a84-1045-4750-8dfd-51a0f463a4db";
const customerId = "customer-1";
const tenantId = "tenant-1";
const logInfo = mock(() => undefined);

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
  designer: {
    id: "821f10b2-ecee-4c72-ace7-c7dee439efdd",
    name: "阿紫",
    avatar: null,
  },
  property: null,
  workflow_state: null,
}));

const listLogs = mock(async () => []);
const getCustomerServiceConfig = mock(async () => null);
const listProjectMembers = mock(async () => [
  {
    id: "member-designer",
    project_id: projectId,
    employee_id: "821f10b2-ecee-4c72-ace7-c7dee439efdd",
    role_code: "designer",
    role_name: "主案设计",
    is_primary: true,
    sort_order: 10,
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:00.000Z",
    employee: {
      id: "821f10b2-ecee-4c72-ace7-c7dee439efdd",
      name: "阿紫",
      avatar: null,
      phone: "18800002002",
    },
  },
  {
    id: "member-supervisor",
    project_id: projectId,
    employee_id: "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
    role_code: "supervisor",
    role_name: "施工管理",
    is_primary: true,
    sort_order: 20,
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:00.000Z",
    employee: {
      id: "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
      name: "欧阳克",
      avatar: null,
      phone: "18800003002",
    },
  },
]);

mock.module("@/services/customer-project-detail", () => ({
  customerProjectDetailService: {
    getOwnedProject,
  },
}));

mock.module("@/services/customer-project-detail-logs", () => ({
  customerProjectDetailLogsService: {
    listLogs,
  },
}));

mock.module("@/services/customer-service-config", () => ({
  customerServiceConfigService: {
    getCustomerServiceConfig,
  },
}));

mock.module("@/services/project-members", () => ({
  projectMemberService: {
    listProjectMembers,
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
    getProjectProgress: mock(async () => ({
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "final_acceptance",
      current_node_title: "竣工验收",
      current_node_type: "confirmation",
      current_business_kind: "final_acceptance",
      current_stage_code: null,
      current_gate: null,
      timeline_nodes: [],
      pending_task_count: 0,
      actions: [],
      warnings: [],
    })),
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
    listCustomerProjectConstructionStages: mock(async () => []),
    listProjectConstructionStagesForProject: mock(async () => []),
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

describe("customer project detail bootstrap team fields", () => {
  test("returns project members like the customer project detail endpoint", async () => {
    const { default: controller } = await import("./detail-bootstrap-controller");
    const testController = controller as unknown as {
      getCustomerProjectDetailBootstrap: (request: unknown) => Promise<{
        data: {
          debug_timing?: {
            workflow_steps?: Record<string, number>;
          };
          project: {
            designer?: unknown;
            supervisor?: unknown;
            members?: Array<{
              role_code: string;
              employee?: { name: string | null } | null;
            }>;
          };
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
        include_stages: false,
        include_campaigns: false,
        debug_timing: true,
      },
      user: {
        tenant_id: tenantId,
        customer_id: customerId,
      },
      id: "req-test",
      log: {
        info: logInfo,
        warn: mock(() => undefined),
      },
    });

    expect(response.data.debug_timing?.workflow_steps).toMatchObject({
      subject_state_runtime_ms: 0,
      graph_ms: 0,
      projection_ms: 0,
    });
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_steps: expect.objectContaining({
          subject_state_runtime_ms: 0,
        }),
      }),
      "[customer-project-detail] timing",
    );

    expect(response.data.project.members?.map((item) => ({
      role_code: item.role_code,
      name: item.employee?.name,
    }))).toEqual([
      { role_code: "designer", name: "阿紫" },
      { role_code: "supervisor", name: "欧阳克" },
    ]);
    expect(response.data.project.designer).toEqual({
      id: "821f10b2-ecee-4c72-ace7-c7dee439efdd",
      name: "阿紫",
      avatar: null,
    });
    expect(response.data.project.supervisor).toEqual({
      id: "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
      name: "欧阳克",
      avatar: null,
    });
  });
});
