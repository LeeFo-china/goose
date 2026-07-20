import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type TableName = "tenant_credit_orders" | "platform_payment_configs";

const CLAIM_REQUEST_1_ID = "10000000-0000-4000-8000-000000000001";
const CLAIM_REQUEST_2_ID = "10000000-0000-4000-8000-000000000002";
const TENANT_1_ID = "20000000-0000-4000-8000-000000000001";
const TENANT_2_ID = "20000000-0000-4000-8000-000000000002";
const ORDER_1_ID = "30000000-0000-4000-8000-000000000001";
const ORDER_2_ID = "30000000-0000-4000-8000-000000000002";

const claimRows = [
  {
    id: CLAIM_REQUEST_1_ID,
    tenant_id: TENANT_1_ID,
    order_id: ORDER_1_ID,
    reason: "客户误充值",
    requested_amount_fen: 10000,
    out_refund_no: "TRR202607100800000001",
    wechat_refund_id: "wechat-refund-1",
    refund_amount_fen: 10000,
    reconcile_attempt_count: 2,
    ignored: "must-not-leak",
  },
  {
    id: CLAIM_REQUEST_2_ID,
    tenant_id: TENANT_2_ID,
    order_id: ORDER_2_ID,
    reason: "重复充值",
    requested_amount_fen: 2000,
    out_refund_no: "TRR202607100800000002",
    wechat_refund_id: null,
    refund_amount_fen: null,
    reconcile_attempt_count: 1,
  },
];

const orderRows = [
  {
    id: ORDER_1_ID,
    tenant_id: TENANT_1_ID,
    amount_fen: 10000,
    paid_amount_fen: 10000,
    payment_config_id: "config-1",
    out_trade_no: "TC202607020001",
    transaction_id: "transaction-1",
  },
  {
    id: ORDER_2_ID,
    tenant_id: TENANT_2_ID,
    amount_fen: 2000,
    paid_amount_fen: 2000,
    payment_config_id: "config-2",
    out_trade_no: "TC202607020002",
    transaction_id: "transaction-2",
  },
];

const configRows = [
  createConfig("config-1", "merchant-1"),
  createConfig("config-2", "merchant-2"),
];

type RpcResult = { data: unknown; error: unknown };

const rpc = mock(
  async (
    _functionName: string,
    _args: Record<string, unknown>,
  ): Promise<RpcResult> => ({ data: claimRows, error: null }),
);
const fromCalls: TableName[] = [];
const selectCalls: Array<readonly [TableName, string]> = [];
const inCalls: Array<readonly [TableName, string, unknown[]]> = [];

class TableQuery {
  constructor(private readonly table: TableName) {}

  select(columns: string) {
    selectCalls.push([this.table, columns]);
    return this;
  }

  in(column: string, values: unknown[]) {
    inCalls.push([this.table, column, values]);
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) =>
      TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const data = this.table === "tenant_credit_orders" ? orderRows : configRows;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      rpc,
      from: (table: TableName) => {
        fromCalls.push(table);
        return new TableQuery(table);
      },
    }),
  },
}));

describe("billingRechargeRefundReconciliationRepository", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: claimRows, error: null }));
    fromCalls.length = 0;
    selectCalls.length = 0;
    inCalls.length = 0;
  });

  test("claims a bounded batch and hydrates orders and configs without N+1", async () => {
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    const result = await repository.claimDue({
      limit: 20,
      leaseSeconds: 120,
      claimToken: "00000000-0000-4000-8000-000000000001",
      now: "2026-07-18T12:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith(
      "billing_claim_wechat_recharge_refunds",
      {
        p_limit: 20,
        p_lease_seconds: 120,
        p_claim_token: "00000000-0000-4000-8000-000000000001",
        p_now: "2026-07-18T12:00:00.000Z",
      },
    );
    expect(fromCalls).toEqual([
      "tenant_credit_orders",
      "platform_payment_configs",
    ]);
    expect(inCalls).toEqual([
      ["tenant_credit_orders", "id", [ORDER_1_ID, ORDER_2_ID]],
      ["platform_payment_configs", "id", ["config-1", "config-2"]],
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: CLAIM_REQUEST_1_ID,
      reconcile_attempt_count: 2,
      order: { id: ORDER_1_ID, payment_config_id: "config-1" },
      config: {
        id: "config-1",
        merchant_id: "merchant-1",
        secret_bundle_revision: "bundle-revision-config-1",
      },
    });
    expect(selectCalls.find(([table]) => table === "platform_payment_configs")?.[1])
      .toContain("secret_bundle_revision");
    expect(result[0]).not.toHaveProperty("ignored");
  });

  test("rejects null and non-array claim RPC results before hydration", async () => {
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    for (const data of [null, { id: CLAIM_REQUEST_1_ID }]) {
      rpc.mockImplementationOnce(async () => ({ data, error: null }));
      await expect(repository.claimDue({
        limit: 20,
        leaseSeconds: 120,
        claimToken: "00000000-0000-4000-8000-000000000001",
        now: "2026-07-18T12:00:00.000Z",
      })).rejects.toMatchObject({ code: "DB_ERROR" });
    }
    expect(fromCalls).toEqual([]);
  });

  test("rejects a non-object claim row without a native TypeError", async () => {
    rpc.mockImplementationOnce(async () => ({ data: [null], error: null }));
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    await expect(repository.claimDue({
      limit: 20,
      leaseSeconds: 120,
      claimToken: "00000000-0000-4000-8000-000000000001",
      now: "2026-07-18T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "DB_ERROR" });
    expect(fromCalls).toEqual([]);
  });

  test("rejects malformed claim fields before hydration", async () => {
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");
    const invalidRows = [
      { ...claimRows[0], reason: undefined },
      { ...claimRows[0], id: "not-a-uuid" },
      { ...claimRows[0], tenant_id: "not-a-uuid" },
      { ...claimRows[0], order_id: "not-a-uuid" },
      { ...claimRows[0], reason: "   " },
      { ...claimRows[0], out_refund_no: undefined },
      { ...claimRows[0], requested_amount_fen: 0 },
      { ...claimRows[0], requested_amount_fen: 1.5 },
      { ...claimRows[0], requested_amount_fen: Number.MAX_SAFE_INTEGER + 1 },
      { ...claimRows[0], out_refund_no: " " },
      { ...claimRows[0], wechat_refund_id: 1 },
      { ...claimRows[0], refund_amount_fen: -1 },
      { ...claimRows[0], refund_amount_fen: 1.5 },
      { ...claimRows[0], refund_amount_fen: Number.MAX_SAFE_INTEGER + 1 },
      { ...claimRows[0], reconcile_attempt_count: -1 },
      { ...claimRows[0], reconcile_attempt_count: 1.5 },
      { ...claimRows[0], reconcile_attempt_count: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const row of invalidRows) {
      rpc.mockImplementationOnce(async () => ({ data: [row], error: null }));
      await expect(repository.claimDue({
        limit: 20,
        leaseSeconds: 120,
        claimToken: "00000000-0000-4000-8000-000000000001",
        now: "2026-07-18T12:00:00.000Z",
      })).rejects.toMatchObject({ code: "DB_ERROR" });
    }
    expect(fromCalls).toEqual([]);
  });

  test("rejects a claim limit above 100 before calling the RPC", async () => {
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    await expect(repository.claimDue({
      limit: 101,
      leaseSeconds: 120,
      claimToken: "00000000-0000-4000-8000-000000000001",
      now: "2026-07-18T12:00:00.000Z",
    })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects a lease outside 30 to 900 seconds before calling the RPC", async () => {
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    for (const leaseSeconds of [29, 901]) {
      await expect(repository.claimDue({
        limit: 20,
        leaseSeconds,
        claimToken: "00000000-0000-4000-8000-000000000001",
        now: "2026-07-18T12:00:00.000Z",
      })).rejects.toMatchObject({
        code: "BILLING_RECHARGE_REFUND_RECONCILE_LEASE_INVALID",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  test("reschedules only the row held by the exact claim token", async () => {
    rpc.mockImplementationOnce(async () => ({ data: true, error: null }));
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    const result = await repository.reschedule({
      refundRequestId: "refund-request-1",
      claimToken: "00000000-0000-4000-8000-000000000001",
      reconcileNextAt: "2026-07-18T12:05:00.000Z",
      checkedAt: "2026-07-18T12:00:00.000Z",
      lastError: "WECHAT_PAY_REFUND_QUERY_FAILED",
      metadata: { wechat_request_id: "wechat-request-1" },
      wechatRefundId: "wechat-refund-1",
      refundAmountFen: 10000,
    });

    expect(result).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "billing_reschedule_wechat_recharge_refund",
      {
        p_refund_request_id: "refund-request-1",
        p_claim_token: "00000000-0000-4000-8000-000000000001",
        p_reconcile_next_at: "2026-07-18T12:05:00.000Z",
        p_checked_at: "2026-07-18T12:00:00.000Z",
        p_last_error: "WECHAT_PAY_REFUND_QUERY_FAILED",
        p_metadata: { wechat_request_id: "wechat-request-1" },
        p_wechat_refund_id: "wechat-refund-1",
        p_refund_amount_fen: 10000,
      },
    );
  });

  test("closes only the row held by the exact claim token", async () => {
    rpc.mockImplementationOnce(async () => ({ data: false, error: null }));
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    const result = await repository.close({
      refundRequestId: "refund-request-1",
      claimToken: "00000000-0000-4000-8000-000000000001",
      checkedAt: "2026-07-18T12:00:00.000Z",
      metadata: { wechat_refund_status: "CLOSED" },
    });

    expect(result).toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      "billing_close_wechat_recharge_refund",
      {
        p_refund_request_id: "refund-request-1",
        p_claim_token: "00000000-0000-4000-8000-000000000001",
        p_checked_at: "2026-07-18T12:00:00.000Z",
        p_metadata: { wechat_refund_status: "CLOSED" },
      },
    );
  });

  test("confirms success with the claim token and returns a lost race as null", async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { billingRechargeRefundReconciliationRepository: repository } =
      await import("./billing-recharge-refund-reconciliation");

    const result = await repository.confirmSuccess({
      refundRequestId: "refund-request-1",
      claimToken: "00000000-0000-4000-8000-000000000001",
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "wechat-refund-1",
      refundAmountFen: 10000,
      refundedAt: "2026-07-18T12:00:00.000Z",
      metadata: { wechat_refund_status: "SUCCESS" },
    });

    expect(result).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      "billing_confirm_claimed_wechat_recharge_refund",
      {
        p_refund_request_id: "refund-request-1",
        p_claim_token: "00000000-0000-4000-8000-000000000001",
        p_out_refund_no: "TRR202607100800000001",
        p_wechat_refund_id: "wechat-refund-1",
        p_refund_amount_fen: 10000,
        p_refunded_at: "2026-07-18T12:00:00.000Z",
        p_metadata: { wechat_refund_status: "SUCCESS" },
      },
    );
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_notification_id");
  });

  test("applies callback terminal state atomically without table writes", async () => {
    rpc.mockImplementationOnce(async () => ({ data: true, error: null }));
    const { billingRechargeRefundCallbackRepository: repository } =
      await import("./billing-recharge-refund-callbacks");

    const result = await repository.applyWechatRechargeRefundCallbackState({
      refundRequestId: "refund-request-1",
      outRefundNo: "TRR202607100800000001",
      status: "ABNORMAL",
      checkedAt: "2026-07-18T12:00:00.000Z",
      metadata: { callback_notify_id: "notify-refund-1" },
    });

    expect(result).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "billing_apply_wechat_recharge_refund_callback_state",
      {
        p_refund_request_id: "refund-request-1",
        p_out_refund_no: "TRR202607100800000001",
        p_status: "ABNORMAL",
        p_checked_at: "2026-07-18T12:00:00.000Z",
        p_metadata: { callback_notify_id: "notify-refund-1" },
      },
    );
    expect(fromCalls).toEqual([]);
  });

  test("keeps the real notification id on callback success confirmation", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { idempotent: false },
      error: null,
    }));
    const { billingRechargeRefundCallbackRepository: repository } =
      await import("./billing-recharge-refund-callbacks");

    await repository.confirmWechatRechargeRefund({
      refundRequestId: "refund-request-1",
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "wechat-refund-1",
      refundAmountFen: 10000,
      refundedAt: "2026-07-18T12:00:00.000Z",
      notificationId: "00000000-0000-4000-8000-000000000099",
      metadata: { callback_notify_id: "notify-refund-1" },
    });

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_notification_id: "00000000-0000-4000-8000-000000000099",
    });
  });
});

function createConfig(id: string, merchantId: string) {
  return {
    id,
    provider: "wechat_pay",
    profile_code: "platform_direct_recharge",
    principal_type: "platform",
    merchant_mode: "direct_merchant",
    merchant_name: "平台微信支付",
    merchant_id: merchantId,
    sub_merchant_id: null,
    app_id: "wx-app",
    sub_app_id: null,
    encrypted_config_ref: `env://${id}`,
    secret_bundle_revision: `bundle-revision-${id}`,
    serial_no: `${id}-serial`,
    notify_url: "https://api.example.com/pay/wechat/callback",
    enabled_channels: ["tenant_recharge"],
    status: "active",
    validation_status: "valid",
    last_validated_at: null,
    risk_switches: {},
    created_by_employee_id: null,
    updated_by_employee_id: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}
