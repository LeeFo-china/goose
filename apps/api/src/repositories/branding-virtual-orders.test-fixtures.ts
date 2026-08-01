import { mock } from "bun:test";

import type { BrandingVirtualOrderRecord } from "./branding-virtual-orders";

export const TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const ORDER_ID = "22222222-2222-4222-8222-222222222222";
export const MAPPING_ID = "33333333-3333-4333-8333-333333333333";
export const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
export const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
export const CLAIM_TOKEN = "77777777-7777-4777-8777-777777777777";

export const order = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  order_no: "BVO-20260801010000000-ABCDEF123456",
  out_trade_no: "BV20260801010000ABCDEF1234567890",
  idempotency_key: IDEMPOTENCY_KEY,
  product_id: "66666666-6666-4666-8666-666666666666",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "购买说明",
  refund_policy: "退款规则",
  environment: "production",
  offer_id: "offer-1",
  provider_product_id: "product-1",
  requested_platform: "unknown",
  settlement_channel: null,
  payer_openid: "openid",
  provider_order_no: null,
  transaction_id: null,
  payment_status: "pending",
  fulfillment_status: "pending",
  refund_status: "none",
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  config_version: 1,
  secret_revision: 1,
  payment_expires_at: "2026-08-01T01:05:00.000Z",
  failure_code: null,
  failure_message: null,
  payment_request_claim_token: null,
  payment_request_claimed_at: null,
  payment_request_claim_expires_at: null,
  payment_request_issued_at: null,
  payment_request_attempt_revision: 0,
  created_by: EMPLOYEE_ID,
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
} satisfies BrandingVirtualOrderRecord;

export async function repositoryWith(input: {
  queryData?: unknown;
  queryError?: unknown;
  rpcData?: unknown;
  rpcError?: unknown;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return query;
    },
    maybeSingle: mock(async () => ({
      data: input.queryData ?? null,
      error: input.queryError ?? null,
    })),
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
    rpc: mock(async (name: string, parameters: Record<string, unknown>) => {
      calls.push(["rpc", name, parameters]);
      return { data: input.rpcData ?? null, error: input.rpcError ?? null };
    }),
  };
  const { BrandingVirtualOrderRepository } = await import(
    "./branding-virtual-orders"
  );
  return {
    repository: new BrandingVirtualOrderRepository(() => client),
    calls,
    client,
  };
}
