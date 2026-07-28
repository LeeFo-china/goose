import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  BrandingAddonCallbackOrderRecord,
  BrandingConfirmPurchaseResult,
  BrandingAddonWechatNotificationRecord,
} from "@/repositories/branding-addon-orders";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { BrandingAddonCallbackContext } from "@/services/wechat-pay-callback-platform-payment";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台普通商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-branding-app",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_PLATFORM",
  secret_bundle_revision: "revision-1",
  serial_no: "serial-1",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "BA202607280001",
  out_trade_no: "BA202607280001",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  amount_fen: 1,
  term_years: 1,
  status: "pending",
  payment_config_id: config.id,
  payment_mchid: config.merchant_id,
  payment_appid: config.app_id,
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies BrandingAddonCallbackOrderRecord;

const matched = {
  kind: "branding_addon",
  config,
  payload: {},
  transaction: {
    merchantMode: "direct_merchant",
    merchantId: order.payment_mchid,
    subMerchantId: null,
    outTradeNo: order.out_trade_no,
    transactionId: "4200000000202607280000000001",
    tradeState: "SUCCESS",
    successTime: "2026-07-28T08:01:00+08:00",
    amountFen: order.amount_fen,
    currency: "CNY",
    requestId: null,
    appid: order.payment_appid,
  },
  order,
} satisfies BrandingAddonCallbackContext;

const notification = {
  id: "notification-1",
  notify_id: "notify-1",
  tenant_id: order.tenant_id,
  order_id: order.id,
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-28T08:01:01.000Z",
  updated_at: "2026-07-28T08:01:01.000Z",
} satisfies BrandingAddonWechatNotificationRecord;

const findNotification = mock(
  async (): Promise<BrandingAddonWechatNotificationRecord | null> =>
    notification,
);
const createNotification = mock(async () => notification);
const markProcessed = mock(async () => notification);
const markFailed = mock(async () => notification);
const confirm = mock(
  async (): Promise<BrandingConfirmPurchaseResult> => ({
    idempotent: true,
    order: null,
    entitlement: null,
    event: null,
    source_type: "purchase",
  }),
);

async function handle(input: {
  existing: BrandingAddonWechatNotificationRecord;
  resourceType?: string;
}) {
  findNotification.mockImplementationOnce(async () => input.existing);
  const { handleBrandingAddonCallback } = await import(
    "./wechat-pay-callback-branding-addon"
  );
  return handleBrandingAddonCallback({
    matched,
    notifyId: notification.notify_id,
    payload: {
      event_type: notification.event_type,
      ...(input.resourceType === undefined
        ? {}
        : { resource_type: input.resourceType }),
    },
    repository: {
      findNotificationByNotifyId: findNotification,
      createNotification,
      markNotificationProcessed: markProcessed,
      markNotificationFailed: markFailed,
    },
    confirmation: { confirm },
  });
}

describe("handleBrandingAddonCallback notification identity", () => {
  beforeEach(() => {
    for (const fn of [
      findNotification,
      createNotification,
      markProcessed,
      markFailed,
      confirm,
    ]) {
      fn.mockClear();
    }
  });

  test.each([true, false])(
    "rejects resource-type mismatch for processed=%s replay",
    async (processed) => {
      await expect(handle({
        existing: { ...notification, processed },
        resourceType: "other-resource",
      })).rejects.toMatchObject({
        code: "BRANDING_ADDON_NOTIFICATION_ID_COLLISION",
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(createNotification).not.toHaveBeenCalled();
    },
  );

  test("validates resource type before a processed replay fast-success", async () => {
    await expect(handle({
      existing: { ...notification, processed: true },
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(confirm).not.toHaveBeenCalled();
  });
});
