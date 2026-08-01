import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import packageJson from "../../package.json";
import type {
  BrandingAddonExpirationOrderRecord,
} from "@/repositories/branding-addon-order-records";
import type {
  BrandingAddonValidatedSuccessTransaction,
} from "@/services/branding-addon-payment-confirmation";
import type { LegacyPaymentQueryResult } from "./branding-virtual-payment-cutover";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let BrandingVirtualPaymentCutover: typeof import(
  "./branding-virtual-payment-cutover"
)["BrandingVirtualPaymentCutover"];

beforeAll(async () => {
  ({ BrandingVirtualPaymentCutover } = await import(
    "./branding-virtual-payment-cutover"
  ));
});

const ORDER: BrandingAddonExpirationOrderRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  order_no: "BA202607310001",
  out_trade_no: "BA202607310001",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  amount_fen: 100,
  term_years: 1,
  status: "pending",
  payment_config_id: "33333333-3333-4333-8333-333333333333",
  payment_mchid: "1900000001",
  payment_appid: "wx-platform-app",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-07-31T10:00:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  expected_guard_version: 3,
  close_claim_token: "44444444-4444-4444-8444-444444444444",
  close_claim_expires_at: "2026-07-31T10:01:00.000Z",
  close_attempt_count: 1,
  close_last_error: null,
  created_at: "2026-07-31T09:55:00.000Z",
  updated_at: "2026-07-31T09:55:00.000Z",
};

const SUCCESS_TRANSACTION = {
  appid: ORDER.payment_appid,
  merchantMode: "direct_merchant",
  merchantId: ORDER.payment_mchid,
  subMerchantId: null,
  outTradeNo: ORDER.out_trade_no,
  transactionId: "4200000000000000001",
  tradeState: "SUCCESS",
  successTime: "2026-07-31T10:00:00+08:00",
  amountFen: ORDER.amount_fen,
  currency: "CNY",
  requestId: "request-1",
} satisfies BrandingAddonValidatedSuccessTransaction;

function createFixture() {
  const repository = {
    claimLegacyPendingOrders: mock(async () => [ORDER]),
    renewCloseClaim: mock(async () => ORDER),
    markOrderClosed: mock(async () => ({
      ...ORDER,
      closed_at: "2026-07-31T10:00:00.000Z",
    })),
    releaseCloseClaim: mock(async () => ({
      ...ORDER,
      closed_at: null,
    })),
    assertVirtualCutoverReady: mock(async () => true),
  };
  const paymentChannel = {
    queryOrder: mock(async (): Promise<LegacyPaymentQueryResult> => ({
      tradeState: "NOTPAY",
    })),
    closeOrder: mock(async () => undefined),
  };
  const paymentConfirmation = {
    confirm: mock(async () => undefined),
  };
  const productRepository = {
    getProduct: mock(async () => ({ purchase_mode: "maintenance" as const })),
  };
  return {
    cutover: new BrandingVirtualPaymentCutover({
      repository,
      paymentChannel,
      paymentConfirmation,
      productRepository,
      nowFactory: () => new Date("2026-07-31T10:00:00.000Z"),
    }),
    repository,
    paymentChannel,
    paymentConfirmation,
  };
}

describe("BrandingVirtualPaymentCutover", () => {
  test("does not allow switching while an old order remains unresolved", async () => {
    const fixture = createFixture();
    fixture.paymentChannel.queryOrder.mockRejectedValueOnce(
      new TypeError("network down"),
    );

    const result = await fixture.cutover.runBatch({ limit: 100 });

    expect(result).toMatchObject({
      claimed: 1,
      unresolved: 1,
      allow_switch: false,
    });
    expect(fixture.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: ORDER.id,
      claimToken: ORDER.close_claim_token,
      errorMessage: "BRANDING_VIRTUAL_CUTOVER_QUERY_FAILED",
    });
    expect(fixture.repository.assertVirtualCutoverReady).not.toHaveBeenCalled();
  });

  test("never claims more than 100 orders and only reports switch readiness", async () => {
    const fixture = createFixture();
    fixture.repository.claimLegacyPendingOrders.mockResolvedValue([]);

    await expect(fixture.cutover.runBatch({ limit: 1_000 })).resolves.toEqual({
      claimed: 0,
      paid: 0,
      closed: 0,
      unresolved: 0,
      release_failed: 0,
      allow_switch: true,
      message: "允许切换",
    });
    expect(fixture.repository.claimLegacyPendingOrders).toHaveBeenCalledWith({
      batchSize: 100,
      leaseSeconds: 60,
    });
  });

  test("confirms successful legacy payment through the existing fulfillment path", async () => {
    const fixture = createFixture();
    fixture.paymentChannel.queryOrder.mockResolvedValueOnce({
      tradeState: "SUCCESS",
      transaction: SUCCESS_TRANSACTION,
    });

    await expect(fixture.cutover.runBatch({ limit: 100 })).resolves
      .toMatchObject({ paid: 1, unresolved: 0, allow_switch: true });
    expect(fixture.paymentConfirmation.confirm).toHaveBeenCalledWith({
      order: ORDER,
      transaction: SUCCESS_TRANSACTION,
      notificationId: null,
      source: "virtual_payment_cutover",
    });
    expect(fixture.repository.markOrderClosed).not.toHaveBeenCalled();
  });

  test("marks a remotely closed order with the migrated channel reason", async () => {
    const fixture = createFixture();
    fixture.paymentChannel.queryOrder.mockResolvedValueOnce({
      tradeState: "CLOSED",
    });

    await expect(fixture.cutover.runBatch({ limit: 100 })).resolves
      .toMatchObject({ closed: 1, unresolved: 0, allow_switch: true });
    expect(fixture.repository.markOrderClosed).toHaveBeenCalledWith({
      orderId: ORDER.id,
      claimToken: ORDER.close_claim_token,
      closedAt: new Date("2026-07-31T10:00:00.000Z"),
      failureCode: "PAYMENT_CHANNEL_MIGRATED",
      failureMessage: "品牌权益已迁移至微信虚拟支付，旧支付订单已关闭",
    });
  });

  test("closes NOTPAY remotely and verifies it before closing locally", async () => {
    const fixture = createFixture();
    fixture.paymentChannel.queryOrder
      .mockResolvedValueOnce({ tradeState: "NOTPAY" })
      .mockResolvedValueOnce({ tradeState: "CLOSED" });

    await expect(fixture.cutover.runBatch({ limit: 100 })).resolves
      .toMatchObject({ closed: 1, unresolved: 0, allow_switch: true });
    expect(fixture.paymentChannel.closeOrder).toHaveBeenCalledWith(ORDER);
    expect(fixture.paymentChannel.queryOrder).toHaveBeenCalledTimes(2);
  });

  test("only closes ORDER_NOT_EXIST locally when no prepay was issued", async () => {
    const fixture = createFixture();
    const withoutPrepay = { ...ORDER, prepay_id: null };
    fixture.repository.claimLegacyPendingOrders.mockResolvedValueOnce([
      withoutPrepay,
    ]);
    fixture.repository.renewCloseClaim.mockResolvedValueOnce(withoutPrepay);
    fixture.paymentChannel.queryOrder.mockRejectedValueOnce({
      code: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details: { status: 404, code: "ORDER_NOT_EXIST" },
    });

    await expect(fixture.cutover.runBatch({ limit: 100 })).resolves
      .toMatchObject({ closed: 1, unresolved: 0, allow_switch: true });
    expect(fixture.repository.markOrderClosed).toHaveBeenCalledWith(
      expect.objectContaining({ requireMissingPrepay: true }),
    );
  });

  test("requires maintenance mode before touching old orders", async () => {
    const fixture = createFixture();
    fixture.cutover = new BrandingVirtualPaymentCutover({
      productRepository: {
        getProduct: mock(async () => ({ purchase_mode: "direct_legacy" })),
      },
      repository: fixture.repository,
      paymentChannel: fixture.paymentChannel,
      paymentConfirmation: fixture.paymentConfirmation,
    });

    await expect(fixture.cutover.runBatch({ limit: 100 })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_CUTOVER_REQUIRES_MAINTENANCE",
    });
    expect(fixture.repository.claimLegacyPendingOrders).not.toHaveBeenCalled();
  });
});

describe("branding virtual payment cutover migration", () => {
  test("guards legacy inserts and uses bounded skip-locked claims", () => {
    const migration = readFileSync(resolve(
      import.meta.dir,
      "../../../../supabase/migrations/20260731135500_guard_legacy_branding_payment_cutover.sql",
    ), "utf8").toLowerCase();

    expect(migration).toContain("branding_addon_payment_channel_migrated");
    expect(migration).toContain("branding_claim_legacy_pending_orders");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 100), 1), 100)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("branding_assert_virtual_cutover_ready");
    expect(migration).toContain("expected_amount_fen = product.amount_fen");
    expect(migration).toContain("mapping.expected_amount_fen >= 100");
    expect(migration).toContain("mapping.validated_at >= secret.updated_at");
  });

  test("runs without Bun implicit env discovery and has no mode mutator", () => {
    expect(packageJson.scripts["branding:virtual-payment:cutover"]).toBe(
      "bun --env-file=/dev/null src/scripts/branding-virtual-payment-cutover.ts",
    );
    const source = readFileSync(resolve(
      import.meta.dir,
      "branding-virtual-payment-cutover.ts",
    ), "utf8");
    expect(source).not.toContain("setPurchaseMode");
    expect(source).not.toContain("purchase_mode: \"wechat_virtual\"");
  });
});
