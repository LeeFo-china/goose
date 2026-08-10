import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const calls: Array<[string, ...unknown[]]> = [];
let maybeResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const query = {
  select(columns: string) { calls.push(["select", columns]); return query; },
  eq(column: string, value: unknown) { calls.push(["eq", column, value]); return query; },
  limit(value: number) { calls.push(["limit", value]); return query; },
  maybeSingle: mock(async () => maybeResult),
};
const client = {
  from(table: string) { calls.push(["from", table]); return query; },
  rpc: mock(async (name: string, params: Record<string, unknown>) => {
    calls.push(["rpc", name, params]);
    return rpcResult;
  }),
};
const confirmInput = {
  refundRequestId: "refund-1",
  serviceOrderId: "order-1",
  transactionId: "transaction-1",
  outTradeNo: "TSO1",
  paymentConfigId: "config-1",
  paymentConfigGuardVersion: 7,
  outRefundNo: "TSRF1",
  wechatRefundId: "wechat-refund-1",
  refundAmountFen: 100,
  refundedAt: "2026-08-10T10:30:00+08:00",
  operatorEmployeeId: "admin-1",
  metadata: { confirmation_source: "platform_service_refund_execution" },
};

function acceptedEnvelope() {
  return {
    order: { id: "order-1", service_status: "accepted" },
    work_order: { id: "work-1", status: "accepted" },
    acceptance_preparation: { id: "acceptance-1", status: "accepted" },
    contract: {
      id: "contract-1", tenant_id: "tenant-1", status: "active",
      service_start_at: "2026-08-10T10:00:00.000Z",
      service_end_at: "2027-08-10T10:00:00.000Z",
    },
    contract_period: {
      id: "period-1", contract_id: "contract-1", tenant_id: "tenant-1",
      service_order_id: "order-1", status: "active",
      starts_at: "2026-08-10T10:00:00.000Z",
      ends_at: "2027-08-10T10:00:00.000Z",
    },
    idempotent: true,
    error_code: null,
  };
}

function refundRequestEnvelope() {
  return {
    id: "refund-1",
    tenant_id: "tenant-1",
    service_order_id: "order-1",
    idempotency_key: "key-1",
    reason: "不再需要服务",
    status: "approved",
    version: 2,
    created_by_employee_id: "employee-1",
    reviewed_by_employee_id: "admin-1",
    reviewed_at: "2026-08-10T10:00:00.000Z",
    review_remark: "同意",
    out_refund_no: null,
    wechat_refund_id: null,
    refund_amount_fen: null,
    refunded_at: null,
    refunded_by_employee_id: null,
    created_at: "2026-08-10T09:00:00.000Z",
    updated_at: "2026-08-10T10:00:00.000Z",
    order: {
      id: "order-1",
      tenant_id: "tenant-1",
      order_no: "TSO1",
      out_trade_no: "TSO1",
      amount_fen: 100,
      paid_amount_fen: 100,
      payment_status: "refund_reviewing",
      service_status: "awaiting_acceptance",
      payment_config_id: "config-1",
      payment_config_guard_version: 7,
      transaction_id: "transaction-1",
    },
  };
}

describe("PlatformServiceFulfillmentRepository access finalization", () => {
  beforeEach(() => {
    calls.length = 0;
    maybeResult = { data: null, error: null };
    rpcResult = { data: null, error: null };
    query.maybeSingle.mockReset();
    query.maybeSingle.mockImplementation(async () => maybeResult);
    client.rpc.mockClear();
  });

  test("maps overdue acceptance to the same contract-period envelope", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client as never);
    rpcResult = { data: acceptedEnvelope(), error: null };

    const result = await repository.confirmOverdueAcceptance({
      workOrderId: "work-1",
      expectedVersion: 5,
      operatorEmployeeId: "admin-1",
      remark: "客户逾期未确认",
    });
    expect(result).toMatchObject({
      contract: { id: "contract-1" },
      contractPeriod: { id: "period-1" },
      idempotent: true,
    });
  });

  test("loads one bounded trusted refund binding without payer or product secrets", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client as never);
    maybeResult = { data: refundRequestEnvelope(), error: null };

    const result = await repository.findPlatformServiceRefundRequestById("refund-1");
    expect(calls).toContainEqual(["from", "tenant_service_refund_requests"]);
    expect(calls).toContainEqual(["eq", "id", "refund-1"]);
    expect(calls).toContainEqual(["limit", 1]);
    const select = calls.find(([method]) => method === "select")?.[1] as string;
    expect(select).toContain("payment_config_guard_version");
    expect(select).toContain("paid_amount_fen");
    expect(select).not.toContain("payer_openid");
    expect(select).not.toContain("product_snapshot");
    expect(result?.order.tenant_id).toBe(result?.tenant_id);

    query.maybeSingle.mockRejectedValueOnce(new Error("SENSITIVE_QUERY_SENTINEL"));
    await expectNoLeak(
      repository.findPlatformServiceRefundRequestById("refund-1"),
      "SENSITIVE_QUERY_SENTINEL",
    );
  });

  test("confirms verified SUCCESS facts with the exact 12-parameter binding", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client as never);
    rpcResult = {
      data: {
        refund_request: { id: "refund-1", status: "refunded" },
        order: { id: "order-1", payment_status: "refunded" },
        contract: null,
        contract_period: null,
        idempotent: false,
        error_code: null,
      },
      error: null,
    };
    expect(await repository.confirmServiceRefund(confirmInput)).toMatchObject({
      refundRequest: { id: "refund-1", status: "refunded" },
      order: { payment_status: "refunded" },
      idempotent: false,
    });
    expect(client.rpc).toHaveBeenCalledWith("platform_service_confirm_refund", {
      p_refund_request_id: "refund-1",
      p_service_order_id: "order-1",
      p_transaction_id: "transaction-1",
      p_out_trade_no: "TSO1",
      p_payment_config_id: "config-1",
      p_payment_config_guard_version: 7,
      p_out_refund_no: "TSRF1",
      p_wechat_refund_id: "wechat-refund-1",
      p_refund_amount_fen: 100,
      p_refunded_at: "2026-08-10T10:30:00+08:00",
      p_operator_employee_id: "admin-1",
      p_metadata: { confirmation_source: "platform_service_refund_execution" },
    });
  });

  test("fails closed without leaking malformed, resolved-error, or rejected RPC data", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client as never);
    rpcResult = { data: { idempotent: "false" }, error: null };
    await expect(repository.confirmServiceRefund(confirmInput)).rejects
      .toMatchObject({ code: "DB_ERROR" });
    rpcResult = { data: null, error: { message: "SENSITIVE_DB_SENTINEL" } };
    await expectNoLeak(
      repository.confirmServiceRefund(confirmInput),
      "SENSITIVE_DB_SENTINEL",
    );
    client.rpc.mockRejectedValueOnce(new Error("SENSITIVE_RPC_SENTINEL"));
    await expectNoLeak(
      repository.confirmServiceRefund(confirmInput),
      "SENSITIVE_RPC_SENTINEL",
    );
  });
});

async function expectNoLeak(promise: Promise<unknown>, sentinel: string) {
  try {
    await promise;
    throw new Error("expected repository failure");
  } catch (error) {
    expect(error).toMatchObject({ code: "DB_ERROR" });
    expect(JSON.stringify(error)).not.toContain(sentinel);
  }
}
