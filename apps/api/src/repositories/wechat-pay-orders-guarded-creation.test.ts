import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const rpc = mock(async (
  _name: string,
  _args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> => ({
  data: { id: "order-1", status: "pending" },
  error: null,
}));

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ rpc }),
  },
}));

const input = {
  tenant_id: "tenant-1",
  payment_config_id: "tenant-config-1",
  platform_payment_config_id: "platform-config-1",
  expected_platform_guard_version: 7,
  expected_tenant_config_updated_at: "2026-07-21T01:00:00.000Z",
  project_id: "project-1",
  workflow_instance_id: "instance-1",
  workflow_task_id: "task-1",
  receivable_plan_id: "plan-1",
  out_trade_no: "WX202607210001",
  amount: 8000,
  payer_openid: "openid-1",
  status: "pending" as const,
  currency: "CNY",
  created_by_employee_id: "employee-1",
  metadata: { source: "workflow_task" },
};

describe("WechatPayOrderRepository guarded creation", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockImplementation(async () => ({
      data: { id: "order-1", status: "pending" },
      error: null,
    }));
  });

  test("creates a pending service-provider order through the guarded RPC", async () => {
    const { wechatPayOrderRepository } = await import("./wechat-pay-orders");

    const result = await wechatPayOrderRepository
      .createServiceProviderOrder(input);

    expect(rpc).toHaveBeenCalledWith(
      "wechat_pay_create_pending_service_provider_order",
      {
        p_tenant_id: input.tenant_id,
        p_payment_config_id: input.payment_config_id,
        p_platform_payment_config_id: input.platform_payment_config_id,
        p_expected_platform_guard_version: 7,
        p_expected_tenant_config_updated_at:
          "2026-07-21T01:00:00.000Z",
        p_project_id: input.project_id,
        p_workflow_instance_id: input.workflow_instance_id,
        p_workflow_task_id: input.workflow_task_id,
        p_receivable_plan_id: input.receivable_plan_id,
        p_out_trade_no: input.out_trade_no,
        p_amount: input.amount,
        p_payer_openid: input.payer_openid,
        p_created_by_employee_id: input.created_by_employee_id,
        p_metadata: input.metadata,
      },
    );
    expect(result).toMatchObject({ id: "order-1", status: "pending" });
  });

  test.each([
    [
      "WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED",
      "WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED",
    ],
    [
      "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
      "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
    ],
    [
      "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
      "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
    ],
  ])("maps %s constraint failures through Errors.business", async (
    databaseCode,
    businessCode,
  ) => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { code: "23514", message: databaseCode },
    }));
    const { wechatPayOrderRepository } = await import("./wechat-pay-orders");

    await expect(
      wechatPayOrderRepository.createServiceProviderOrder(input),
    ).rejects.toMatchObject({ statusCode: 409, code: businessCode });
  });

  test("wraps other RPC failures through Errors.dbError", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { code: "XX000", message: "database detail" },
    }));
    const { wechatPayOrderRepository } = await import("./wechat-pay-orders");

    await expect(
      wechatPayOrderRepository.createServiceProviderOrder(input),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "创建服务商微信支付订单失败",
    });
  });
});
