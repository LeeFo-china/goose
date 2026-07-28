import { describe, expect, mock, test } from "bun:test";

import type { BrandingAddonExpirationOrderRecord } from "@/repositories/branding-addon-order-records";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "品牌权益商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-branding-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://branding-addon",
  secret_bundle_revision: "revision-1",
  serial_no: "SERIAL-NO",
  notify_url: "https://api.example.com/wechat/notify",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  recharge_guard_version: 7,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "test-private-key",
  apiV3Key: "test-api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-1",
} satisfies WechatPaySecretBundle;

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "BA202607280001",
  out_trade_no: "BA-WX-1",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  amount_fen: 1,
  term_years: 1,
  status: "pending",
  prepay_id: "prepay-1",
  payment_config_id: config.id,
  expected_guard_version: 7,
  payment_mchid: config.merchant_id,
  payment_appid: config.app_id,
  payment_expires_at: "2026-07-28T07:59:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  close_claim_token: "claim-1",
  close_claim_expires_at: "2026-07-28T08:01:00.000Z",
  close_attempt_count: 1,
  close_last_error: null,
  created_at: "2026-07-28T07:55:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies BrandingAddonExpirationOrderRecord;

function successPayload(appid: string | undefined) {
  return {
    appid,
    mchid: order.payment_mchid,
    out_trade_no: order.out_trade_no,
    transaction_id: "4200000000202607280000000001",
    trade_state: "SUCCESS",
    success_time: "2026-07-28T08:00:30+08:00",
    amount: { total: order.amount_fen, currency: "CNY" },
    requestId: "wechat-request-id",
  };
}

async function createHarness(queryPayload: Record<string, unknown>) {
  const renewCloseClaim = mock(async () => order);
  const releaseCloseClaim = mock(async () => null);
  const confirm = mock(async () => ({}));
  const queryTransactionByOutTradeNo = mock(async () => queryPayload);
  const closeTransactionByOutTradeNo = mock(async () => undefined);
  const { BrandingAddonExpirationService } = await import(
    "@/services/branding-addon-expiration"
  );
  const service = new BrandingAddonExpirationService({
    repository: {
      claimExpiredOrders: mock(async () => [order]),
      renewCloseClaim,
      markOrderClosed: mock(async () => null),
      releaseCloseClaim,
    },
    paymentConfigRepository: {
      findWechatPayConfigById: mock(async () => config),
    },
    secretBundleService: { load: mock(async () => secretBundle) },
    wechatPayGateway: {
      queryTransactionByOutTradeNo,
      closeTransactionByOutTradeNo,
    },
    paymentConfirmation: { confirm },
    leaseSeconds: 60,
  });
  return {
    service,
    renewCloseClaim,
    releaseCloseClaim,
    confirm,
    queryTransactionByOutTradeNo,
    closeTransactionByOutTradeNo,
  };
}

describe("BrandingAddonExpirationService hardening", () => {
  test.each([
    ["missing", undefined],
    ["mismatched", "wx-other-app"],
  ] as const)("does not confirm SUCCESS with %s upstream appid", async (
    _case,
    appid,
  ) => {
    const harness = await createHarness(successPayload(appid));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.confirm).not.toHaveBeenCalled();
    expect(harness.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: order.id,
      claimToken: order.close_claim_token,
      errorMessage: "BRANDING_ADDON_EXPIRE_APPID_MISMATCH",
    });
    expect(result).toMatchObject({ claimed: 1, paid: 0, failed: 1 });
  });

  test("classifies a second renewal repository error as failed", async () => {
    const harness = await createHarness({
      appid: order.payment_appid,
      mchid: order.payment_mchid,
      out_trade_no: order.out_trade_no,
      trade_state: "NOTPAY",
      requestId: "wechat-request-id",
    });
    harness.renewCloseClaim
      .mockImplementationOnce(async () => order)
      .mockImplementationOnce(async () => {
        throw new Error("database unavailable");
      });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.closeTransactionByOutTradeNo).not.toHaveBeenCalled();
    expect(harness.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: order.id,
      claimToken: order.close_claim_token,
      errorMessage: "BRANDING_ADDON_EXPIRE_CLAIM_RENEW_FAILED",
    });
    expect(result).toMatchObject({ claimed: 1, failed: 1, retried: 0 });
  });
});
