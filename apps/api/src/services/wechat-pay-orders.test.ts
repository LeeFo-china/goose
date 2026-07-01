import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "11111111-1111-4111-8111-111111111111";
const receivablePlanId = "22222222-2222-4222-8222-222222222222";
const workflowTaskId = "33333333-3333-4333-8333-333333333333";
const workflowInstanceId = "44444444-4444-4444-8444-444444444444";
const paymentConfigId = "55555555-5555-4555-8555-555555555555";
const employeeId = "66666666-6666-4666-8666-666666666666";

const paymentCollectionTask = {
  id: workflowTaskId,
  tenant_id: tenantId,
  instance_id: workflowInstanceId,
  instance_node_id: "77777777-7777-4777-8777-777777777777",
  definition_id: "88888888-8888-4888-8888-888888888888",
  version_id: "99999999-9999-4999-8999-999999999999",
  node_id: "aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa",
  node_key: "payment_stage_2",
  node_type: "confirmation" as const,
  title: "中期进度款",
  status: "pending" as const,
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-07-01T10:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
  instance: {
    id: workflowInstanceId,
    subject_type: "project" as const,
    subject_id: projectId,
    status: "running" as const,
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_2",
      },
    },
  },
};

const receivablePlan = {
  id: receivablePlanId,
  tenant_id: tenantId,
  project_id: projectId,
  workflow_instance_id: workflowInstanceId,
  workflow_node_key: "payment_stage_2",
  source_type: "workflow_node",
  source_id: "77777777-7777-4777-8777-777777777777",
  payment_type: "stage_2",
  title: "中期进度款",
  amount: 10000,
  paid_amount: 2000,
  status: "partially_paid",
  due_date: "2026-07-01",
};

const activeConfig = {
  id: paymentConfigId,
  tenant_id: tenantId,
  provider: "wechat_pay",
  principal_type: "tenant",
  merchant_mode: "direct_merchant",
  merchant_name: "固始晴天装饰微信商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-app-1",
  sub_app_id: null,
  applyment_business_code: null,
  applyment_id: null,
  applyment_state: "not_started",
  applyment_state_message: null,
  appid_binding_state: "not_required",
  appid_binding_message: null,
  opened_at: null,
  suspended_at: null,
  status: "active",
  enabled_at: null,
  disabled_at: null,
  enabled_channels: ["project_payment"],
  settlement_account_summary: null,
  encrypted_config_ref: null,
  risk_switches: {},
  serial_no: null,
  notify_url: null,
  validation_status: "unchecked",
  last_validated_at: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T09:00:00.000Z",
};

const pendingOrder = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tenant_id: tenantId,
  payment_config_id: paymentConfigId,
  project_id: projectId,
  workflow_instance_id: workflowInstanceId,
  workflow_task_id: workflowTaskId,
  receivable_plan_id: receivablePlanId,
  payment_id: null,
  out_trade_no: "WX202607010001",
  transaction_id: null,
  amount: 8000,
  paid_amount: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: null,
  prepay_id: null,
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: {},
  created_by_employee_id: employeeId,
  created_at: "2026-07-01T10:01:00.000Z",
  updated_at: "2026-07-01T10:01:00.000Z",
};

const findById = mock(async () => paymentCollectionTask);
const findPendingByWorkflowTask = mock(
  async (): Promise<typeof pendingOrder | null> => null,
);
const findReceivablePlan = mock(
  async (): Promise<typeof receivablePlan | null> => receivablePlan,
);
const createOrder = mock(async (input: Record<string, unknown>) => ({
  ...pendingOrder,
  ...input,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  created_at: "2026-07-01T10:02:00.000Z",
  updated_at: "2026-07-01T10:02:00.000Z",
}));
const listOrders = mock(async () => ({
  list: [pendingOrder],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
}));
const findWechatPayConfig = mock(
  async (): Promise<typeof activeConfig | null> => activeConfig,
);
const assertTenantContext = mock((authContext: AuthContext) => {
  if (!authContext.tenantId) {
    throw Object.assign(new Error("缺少租户上下文"), {
      statusCode: 403,
      code: "TENANT_CONTEXT_REQUIRED",
    });
  }
  return authContext.tenantId;
});
const hasPermission = mock((authContext: AuthContext, permissionCode: string) =>
  authContext.permissions.some((permission) => permission.code === permissionCode)
);

function authContext(
  permissions: AuthContext["permissions"] = [
    { code: "finance.payment.confirm", scope: "all" },
  ],
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId,
    tenantId,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "小龙女",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "FINANCE",
    departmentName: "财务部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions,
    ...overrides,
  };
}

async function createService() {
  const { WechatPayOrderService } = await import("./wechat-pay-orders");
  return new WechatPayOrderService({
    orderRepository: {
      findPendingByWorkflowTask,
      findReceivablePlan,
      createOrder,
      listOrders,
    },
    workflowTaskRepository: {
      findById,
    },
    configRepository: {
      findWechatPayConfig,
    },
    accessPolicyService: {
      assertTenantContext,
      hasPermission,
    },
    tradeNoFactory: () => "WX202607010999",
  });
}

describe("WechatPayOrderService", () => {
  beforeEach(() => {
    findById.mockClear();
    findPendingByWorkflowTask.mockClear();
    findReceivablePlan.mockClear();
    createOrder.mockClear();
    listOrders.mockClear();
    findWechatPayConfig.mockClear();
    assertTenantContext.mockClear();
    hasPermission.mockClear();
    findById.mockImplementation(async () => paymentCollectionTask);
    findPendingByWorkflowTask.mockImplementation(async () => null);
    findReceivablePlan.mockImplementation(async () => receivablePlan);
    findWechatPayConfig.mockImplementation(async () => activeConfig);
  });

  test("creates pending order bound to receivable and executable workflow task", async () => {
    const service = await createService();

    const result = await service.createOrder(authContext(), {
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 8000,
    });

    expect(findById).toHaveBeenCalledWith({ tenantId, taskId: workflowTaskId });
    expect(findReceivablePlan).toHaveBeenCalledWith({
      tenantId,
      planId: receivablePlanId,
    });
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        payment_config_id: paymentConfigId,
        project_id: projectId,
        workflow_instance_id: workflowInstanceId,
        workflow_task_id: workflowTaskId,
        receivable_plan_id: receivablePlanId,
        out_trade_no: "WX202607010999",
        amount: 8000,
        status: "pending",
        created_by_employee_id: employeeId,
      }),
    );
    expect(result.idempotent).toBe(false);
    expect(result.payment_request).toBeNull();
    expect(result.order).toMatchObject({
      out_trade_no: "WX202607010999",
      status: "pending",
      amount: 8000,
    });
    expect(result.receivable_plan).toMatchObject({
      id: receivablePlanId,
      remaining_amount: 8000,
    });
  });

  test("returns existing pending order for same workflow task without inserting", async () => {
    findPendingByWorkflowTask.mockImplementationOnce(async () => pendingOrder);
    const service = await createService();

    const result = await service.createOrder(authContext(), {
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 8000,
    });

    expect(createOrder).not.toHaveBeenCalled();
    expect(result.idempotent).toBe(true);
    expect(result.order.id).toBe(pendingOrder.id);
  });

  test("rejects order creation when employee cannot execute task", async () => {
    const service = await createService();

    await expect(
      service.createOrder(authContext([], { employeeId: "other-employee" }), {
        project_id: projectId,
        receivable_plan_id: receivablePlanId,
        workflow_task_id: workflowTaskId,
        amount: 8000,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "WECHAT_PAY_TASK_NOT_EXECUTABLE",
    });

    expect(findPendingByWorkflowTask).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  test("rejects order when receivable plan does not belong to project", async () => {
    findReceivablePlan.mockImplementationOnce(async () => ({
      ...receivablePlan,
      project_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    }));
    const service = await createService();

    await expect(
      service.createOrder(authContext(), {
        project_id: projectId,
        receivable_plan_id: receivablePlanId,
        workflow_task_id: workflowTaskId,
        amount: 8000,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_RECEIVABLE_PROJECT_MISMATCH",
    });

    expect(createOrder).not.toHaveBeenCalled();
  });

  test("rejects amount greater than receivable remaining amount", async () => {
    const service = await createService();

    await expect(
      service.createOrder(authContext(), {
        project_id: projectId,
        receivable_plan_id: receivablePlanId,
        workflow_task_id: workflowTaskId,
        amount: 8000.01,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_AMOUNT_EXCEEDS_RECEIVABLE",
      details: expect.objectContaining({
        receivable_remaining_amount: 8000,
        order_amount: 8000.01,
      }),
    });

    expect(createOrder).not.toHaveBeenCalled();
  });

  test("lists orders for order readers with pagination filters", async () => {
    const service = await createService();

    const result = await service.listOrders(
      authContext([{ code: "wechat_pay.order.read", scope: "all" }]),
      { page: 1, pageSize: 20, status: "pending" },
    );

    expect(listOrders).toHaveBeenCalledWith({
      tenantId,
      query: { page: 1, pageSize: 20, status: "pending" },
    });
    expect(result.list[0]?.id).toBe(pendingOrder.id);
  });

  test("rejects order list without read permission", async () => {
    const service = await createService();

    await expect(
      service.listOrders(authContext([]), { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    expect(listOrders).not.toHaveBeenCalled();
  });
});
