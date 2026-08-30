import { beforeEach, expect, mock, test } from "bun:test";
import Fastify from "fastify";
import errorHandler from "@/plugins/error-handler";
import { registerRoutes } from "@/utils/decorators/route";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const startRuntimeInstance = mock(async () => ({ ok: true as const }));
const rebuildRuntimeInstance = mock(async () => ({ ok: true as const }));
const completeRuntimeNode = mock(async () => ({ ok: true as const }));

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext: mock(async () => authContext()),
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => undefined),
    assertTenantId: mock(() => "tenant-1"),
    assertPermission: mock(() => undefined),
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getDefinitionById: mock(async () => supplierDefinition()),
    startRuntimeInstance,
    rebuildRuntimeInstance,
    completeRuntimeNode,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById: mock(async () => supplierTask()),
  },
}));

beforeEach(() => {
  startRuntimeInstance.mockClear();
  rebuildRuntimeInstance.mockClear();
  completeRuntimeNode.mockClear();
});

test("public generic workflow mutation routes enforce the supplier boundary", async () => {
  const app = Fastify();
  errorHandler(app);
  const [{ default: workflowController }, { default: workflowTaskController }] =
    await Promise.all([
      import("@/controllers/workflows"),
      import("@/controllers/workflow-tasks"),
    ]);
  registerRoutes(app, workflowController);
  registerRoutes(app, workflowTaskController);

  const requests = [
    app.inject({
      method: "POST",
      url: "/workflows/11111111-1111-4111-8111-111111111111/runtime/instances",
      payload: {
        subject_type: "project",
        subject_id: "project-1",
        context: { budget_status: "within_budget" },
      },
    }),
    app.inject({
      method: "POST",
      url: "/workflows/11111111-1111-4111-8111-111111111111/runtime/rebuild",
      payload: {
        subject_type: "supplier_purchase_batch",
        subject_id: "batch-1",
        reason: "修复流程",
        context: { budget_status: "within_budget" },
        delete_completed_instances: false,
        dry_run: false,
      },
    }),
    app.inject({
      method: "POST",
      url: "/workflow-tasks/22222222-2222-4222-8222-222222222222/complete",
      payload: {
        action: "approve",
        output: { decision: "approved", budget_status: "within_budget" },
      },
    }),
  ];

  for (const response of await Promise.all(requests)) {
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_BUSINESS_COMMAND_REQUIRED",
    });
  }
  expect(startRuntimeInstance).not.toHaveBeenCalled();
  expect(rebuildRuntimeInstance).not.toHaveBeenCalled();
  expect(completeRuntimeNode).not.toHaveBeenCalled();
  await app.close();
});

function authContext() {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "采购负责人",
    employeeStatus: "active",
    roleCodes: [],
    roles: [],
    permissions: [],
  };
}

function supplierDefinition() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "tenant-1",
    workflow_key: "supplier_purchase_batch_approval",
    name: "采购批次审批",
    description: null,
    category: "approval",
    status: "active",
    active_version_id: "version-1",
  };
}

function supplierTask() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    instance_node_id: "instance-node-1",
    definition_id: "11111111-1111-4111-8111-111111111111",
    node_key: "purchase_review",
    node_type: "approval",
    title: "采购审批",
    status: "pending",
    assignee_employee_id: "employee-1",
    assignee_role_code: null,
    assignee_permission_code: null,
    instance: {
      id: "instance-1",
      subject_type: "supplier_purchase_batch",
      subject_id: "batch-1",
      status: "running",
      current_node_key: "purchase_review",
      current_node_snapshot: {},
    },
  };
}
