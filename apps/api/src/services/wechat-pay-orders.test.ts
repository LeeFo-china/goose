import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import {
  activeConfig,
  authContext,
  employeeId,
  paymentCollectionTask,
  paymentConfigId,
  pendingOrder,
  projectId,
  receivablePlan,
  receivablePlanId,
  tenantId,
  workflowInstanceId,
  workflowTaskId,
} from "./wechat-pay-orders.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
const markPrepayCreated = mock(async (input: Record<string, unknown>) => ({
  ...pendingOrder,
  id: String(input.orderId || pendingOrder.id),
  out_trade_no: "WX202607010999",
  amount: 8000,
  payer_openid: "o-test-openid",
  prepay_id: String(input.prepayId || "prepay-test"),
}));
const listOrders = mock(async () => ({
  list: [pendingOrder],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
}));
const findWechatPayConfig = mock(
  async (): Promise<typeof activeConfig | null> => activeConfig,
);
const loadSecretBundle = mock(async (): Promise<WechatPaySecretBundle> => ({
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
}));
const createJsapiPrepay = mock(async () => ({
  prepayId: "prepay-test",
  paymentRequest: {
    timeStamp: "1782873600",
    nonceStr: "nonce",
    package: "prepay_id=prepay-test",
    signType: "RSA" as const,
    paySign: "pay-sign",
  },
}));
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

async function createService() {
  const { WechatPayOrderService } = await import("./wechat-pay-orders");
  return new WechatPayOrderService({
    orderRepository: {
      findPendingByWorkflowTask,
      findReceivablePlan,
      createOrder,
      markPrepayCreated,
      listOrders,
    },
    workflowTaskRepository: {
      findById,
    },
    configRepository: {
      findWechatPayConfig,
    },
    secretBundleService: {
      load: loadSecretBundle,
    },
    wechatPayGateway: {
      createJsapiPrepay,
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
    markPrepayCreated.mockClear();
    listOrders.mockClear();
    findWechatPayConfig.mockClear();
    loadSecretBundle.mockClear();
    createJsapiPrepay.mockClear();
    assertTenantContext.mockClear();
    hasPermission.mockClear();
    findById.mockImplementation(async () => paymentCollectionTask);
    findPendingByWorkflowTask.mockImplementation(async () => null);
    findReceivablePlan.mockImplementation(async () => receivablePlan);
    findWechatPayConfig.mockImplementation(async () => ({
      ...activeConfig,
      encrypted_config_ref: "env://WECHAT_PAY_TEST",
    }));
  });

  test("creates pending order bound to receivable and executable workflow task", async () => {
    const service = await createService();

    const result = await service.createOrder(authContext(), {
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 8000,
      payer_openid: "o-test-openid",
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
        payer_openid: "o-test-openid",
        status: "pending",
        created_by_employee_id: employeeId,
      }),
    );
    expect(result.idempotent).toBe(false);
    expect(loadSecretBundle).toHaveBeenCalledWith("env://WECHAT_PAY_TEST");
    expect(createJsapiPrepay).toHaveBeenCalledWith({
      config: expect.objectContaining({ id: paymentConfigId }),
      order: expect.objectContaining({
        out_trade_no: "WX202607010999",
        payer_openid: "o-test-openid",
      }),
      description: "中期进度款",
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
    expect(markPrepayCreated).toHaveBeenCalledWith({
      tenantId,
      orderId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      prepayId: "prepay-test",
    });
    expect(result.payment_request).toMatchObject({
      package: "prepay_id=prepay-test",
      paySign: "pay-sign",
    });
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

  test("stores service provider sub merchant routing metadata", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...activeConfig,
      merchant_mode: "service_provider_sub_merchant",
      merchant_id: "1561816121",
      sub_merchant_id: "1900000002",
      app_id: "wx-service-app",
      sub_app_id: "wx-platform-app",
      applyment_state: "opened",
      appid_binding_state: "bound",
    }));
    const service = await createService();

    await service.createOrder(authContext(), {
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 8000,
      payer_openid: "o-test-openid",
    });

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_config_id: paymentConfigId,
        metadata: expect.objectContaining({
          principal_type: "tenant",
          merchant_mode: "service_provider_sub_merchant",
          merchant_id: "1561816121",
          sub_merchant_id: "1900000002",
          app_id: "wx-service-app",
          sub_app_id: "wx-platform-app",
        }),
      }),
    );
  });

  test("creates service provider order without sub app id", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...activeConfig,
      merchant_mode: "service_provider_sub_merchant",
      merchant_id: "service-provider-mchid",
      sub_merchant_id: "sub-merchant-mchid",
      app_id: "wx-service-provider-app",
      sub_app_id: null,
      applyment_state: "opened",
      appid_binding_state: "bound",
      encrypted_config_ref: "env://WECHAT_PAY_TEST",
    }));
    const service = await createService();

    const result = await service.createOrder(authContext(), {
      project_id: projectId,
      receivable_plan_id: receivablePlanId,
      workflow_task_id: workflowTaskId,
      amount: 8000,
      payer_openid: "o-service-provider-openid",
    });

    expect(createJsapiPrepay).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        app_id: "wx-service-provider-app",
        sub_app_id: null,
      }),
      order: expect.objectContaining({
        payer_openid: "o-service-provider-openid",
      }),
    }));
    expect(result.idempotent).toBe(false);
  });

  test("rejects order creation when payment config is not active", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...activeConfig,
      status: "pending",
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
      code: "WECHAT_PAY_CONFIG_NOT_ACTIVE",
    });

    expect(createOrder).not.toHaveBeenCalled();
  });

  test("rejects service provider order before sub merchant is ready", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...activeConfig,
      merchant_mode: "service_provider_sub_merchant",
      merchant_id: "1561816121",
      sub_merchant_id: null,
      app_id: "wx-service-app",
      sub_app_id: "wx-platform-app",
      applyment_state: "reviewing",
      appid_binding_state: "pending_confirm",
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
      code: "WECHAT_PAY_SUB_MERCHANT_NOT_READY",
    });

    expect(createOrder).not.toHaveBeenCalled();
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
