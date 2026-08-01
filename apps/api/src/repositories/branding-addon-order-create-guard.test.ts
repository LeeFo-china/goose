import { describe, expect, test } from "bun:test";

import {
  BrandingAddonOrderRepository,
  type BrandingAddonOrderCreateInput,
} from "@/repositories/branding-addon-orders";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const orderInput = {
  tenant_id: "tenant-a",
  order_no: "order-no-1",
  out_trade_no: "trade-no-1",
  idempotency_key: "00000000-0000-4000-8000-000000000001",
  product_id: "product-1",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1,
  purchase_notes: "自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  status: "pending",
  channel: "wechat_pay",
  payer_openid: "openid-1",
  payment_config_id: "config-1",
  expected_guard_version: 2,
  payment_mchid: "mchid-1",
  payment_appid: "appid-1",
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  created_by: "employee-1",
  metadata: {},
} satisfies BrandingAddonOrderCreateInput;

function createRepository(error: unknown, calls: unknown[][] = []) {
  return new BrandingAddonOrderRepository(() => ({
    from: () => {
      throw new Error("table query must not be used");
    },
    rpc: async (name, params) => {
      calls.push([name, params]);
      return { data: null, error };
    },
  }));
}

describe("BrandingAddonOrderRepository atomic create errors", () => {
  test("passes the immutable snapshot only through the guarded RPC", async () => {
    const calls: unknown[][] = [];
    await createRepository(null, calls).createOrder(orderInput);
    expect(calls).toEqual([[
      "branding_create_addon_order",
      {
        p_tenant_id: orderInput.tenant_id,
        p_order_no: orderInput.order_no,
        p_out_trade_no: orderInput.out_trade_no,
        p_idempotency_key: orderInput.idempotency_key,
        p_product_id: orderInput.product_id,
        p_product_code: orderInput.product_code,
        p_entitlement_code: orderInput.entitlement_code,
        p_product_name: orderInput.product_name,
        p_amount_fen: orderInput.amount_fen,
        p_term_years: orderInput.term_years,
        p_purchase_notes: orderInput.purchase_notes,
        p_refund_policy: orderInput.refund_policy,
        p_payer_openid: orderInput.payer_openid,
        p_payment_config_id: orderInput.payment_config_id,
        p_expected_guard_version: orderInput.expected_guard_version,
        p_payment_mchid: orderInput.payment_mchid,
        p_payment_appid: orderInput.payment_appid,
        p_payment_expires_at: orderInput.payment_expires_at,
        p_created_by: orderInput.created_by,
        p_metadata: orderInput.metadata,
      },
    ]]);
  });

  test.each([
    ["BRANDING_ENTITLEMENT_SUSPENDED", "品牌权益已暂停，不能购买或续费"],
    ["BRANDING_ENTITLEMENT_REVOKED", "品牌权益已撤销，不能购买或续费"],
    ["BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED", "品牌权益购买渠道已迁移"],
  ] as const)("maps %s without database details", async (code, message) => {
    const repository = createRepository({
      code: "P0001",
      message: "secret SQL state",
      details: `${code}: relation private_secret`,
    });
    await expect(repository.createOrder(orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code,
      message,
      details: undefined,
    });
  });

  test("maps the single-pending unique constraint", async () => {
    const repository = createRepository({
      code: "23505",
      message:
        'duplicate key violates "tenant_addon_orders_pending_product_unique_idx"',
    });
    await expect(repository.createOrder(orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PENDING_ORDER_EXISTS",
    });
  });

  test("sanitizes unknown database errors", async () => {
    const repository = createRepository({
      code: "XX000",
      message: "relation private_secret does not exist",
      details: "password=database-secret",
    });
    await expect(repository.createOrder(orderInput)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "创建年度品牌权益订单失败",
      details: undefined,
    });
  });
});
