import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { TenantCreditRefundRequestRecord } from "@/repositories/billing-recharge-refunds";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type TableName = "tenant_credit_orders" | "tenants";
type RpcResult = { data: unknown; error: unknown };

const requestRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  tenant_id: "20000000-0000-4000-8000-000000000001",
  order_id: "30000000-0000-4000-8000-000000000001",
  request_no: "TRR202607100800000001",
  idempotency_key: "40000000-0000-4000-8000-000000000001",
  status: "refunding",
  reason: "客户误充值",
  requested_amount_fen: 10000,
  requested_credits: 1100,
  requested_by_employee_id: "50000000-0000-4000-8000-000000000001",
  reviewed_by_employee_id: "50000000-0000-4000-8000-000000000002",
  reviewed_at: "2026-07-18T11:00:00.000Z",
  review_note: "同意退款",
  out_refund_no: "TRR202607100800000001",
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  failure_message: null,
  metadata: {},
  created_at: "2026-07-18T10:00:00.000Z",
  updated_at: "2026-07-18T12:00:00.000Z",
} satisfies TenantCreditRefundRequestRecord;

const orderRecord = {
  id: requestRecord.order_id,
  tenant_id: requestRecord.tenant_id,
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-02T08:05:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "60000000-0000-4000-8000-000000000001",
  out_trade_no: "TC202607020001",
  prepay_id: "prepay-credit-1",
  transaction_id: "4200000000202607020000000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: null,
  refund_status: "refunding",
  refund_requested_at: "2026-07-18T10:00:00.000Z",
  refunded_at: null,
  refund_amount_fen: null,
  created_at: "2026-07-02T08:00:00.000Z",
  updated_at: "2026-07-18T12:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const tenantRecord = {
  id: requestRecord.tenant_id,
  name: "固始晴天装饰",
  slug: "qingtian",
};

const rpc = mock(
  async (
    _functionName: string,
    _args: Record<string, unknown>,
  ): Promise<RpcResult> => ({ data: requestRecord, error: null }),
);
const fromCalls: TableName[] = [];
const inCalls: Array<readonly [TableName, string, unknown[]]> = [];

class TableQuery {
  constructor(private readonly table: TableName) {}

  select() {
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
    const data = this.table === "tenant_credit_orders"
      ? [orderRecord]
      : [tenantRecord];
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

describe("platformBillingRechargeRefundRepository.beginWechatRefund", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: requestRecord, error: null }));
    fromCalls.length = 0;
    inCalls.length = 0;
  });

  test("maps exact RPC arguments and hydrates the returned request", async () => {
    const { platformBillingRechargeRefundRepository: repository } =
      await import("./platform-billing-recharge-refunds");

    const result = await repository.beginWechatRefund({
      requestId: requestRecord.id,
      outRefundNo: requestRecord.out_refund_no ?? "",
      now: "2026-07-18T12:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("billing_begin_wechat_recharge_refund", {
      p_refund_request_id: requestRecord.id,
      p_out_refund_no: "TRR202607100800000001",
      p_now: "2026-07-18T12:00:00.000Z",
    });
    expect(fromCalls).toEqual(["tenant_credit_orders", "tenants"]);
    expect(inCalls).toEqual([
      ["tenant_credit_orders", "id", [requestRecord.order_id]],
      ["tenants", "id", [requestRecord.tenant_id]],
    ]);
    expect(result).toMatchObject({
      id: requestRecord.id,
      status: "refunding",
      order: { id: orderRecord.id },
      tenant: tenantRecord,
    });
  });

  test("wraps begin RPC database errors without hydration", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "rpc failed" },
    }));
    const { platformBillingRechargeRefundRepository: repository } =
      await import("./platform-billing-recharge-refunds");

    await expect(repository.beginWechatRefund({
      requestId: requestRecord.id,
      outRefundNo: "TRR202607100800000001",
      now: "2026-07-18T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "DB_ERROR" });
    expect(fromCalls).toEqual([]);
  });

  test("returns null without hydration when the atomic begin loses the race", async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { platformBillingRechargeRefundRepository: repository } =
      await import("./platform-billing-recharge-refunds");

    const result = await repository.beginWechatRefund({
      requestId: requestRecord.id,
      outRefundNo: "TRR202607100800000001",
      now: "2026-07-18T12:00:00.000Z",
    });

    expect(result).toBeNull();
    expect(fromCalls).toEqual([]);
  });
});
