import { mock } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import type { WechatPayQueryTransactionByOutTradeNoInput } from "./wechat-pay-gateway-query-transaction";

export const CLOCK_START = new Date("2026-07-18T03:00:00.000Z");

export const defaultPaymentConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台充值商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

export const defaultSecretBundle = {
  privateKeyPem: "test-private-key",
  apiV3Key: "test-api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

export function makePaymentConfig(
  id: string,
  overrides: Partial<PlatformPaymentConfigRecord> = {},
): PlatformPaymentConfigRecord {
  return {
    ...defaultPaymentConfig,
    id,
    encrypted_config_ref: `secret://${id}`,
    ...overrides,
  };
}

export function makeOrder(
  sequence = 1,
  overrides: Partial<TenantCreditOrderRecord> = {},
): TenantCreditOrderRecord {
  return {
    id: `order-${sequence}`,
    tenant_id: `tenant-${sequence}`,
    order_no: `R20260718${sequence}`,
    idempotency_key: null,
    package_code: "credits-100",
    credits: 100,
    amount_fen: 100,
    bonus_credits: 0,
    channel: "wechat_pay",
    status: "pending",
    paid_at: null,
    created_by: null,
    remark: null,
    metadata: {},
    payment_config_id: defaultPaymentConfig.id,
    out_trade_no: `WX${sequence}`,
    prepay_id: `prepay-${sequence}`,
    payment_expires_at: "2026-07-18T02:59:00.000Z",
    transaction_id: null,
    paid_amount_fen: 0,
    closed_at: null,
    latest_notification_id: null,
    close_claim_token: `claim-${sequence}`,
    close_claim_expires_at: "2026-07-18T03:01:00.000Z",
    close_attempt_count: 1,
    close_last_error: null,
    created_at: "2026-07-18T02:55:00.000Z",
    updated_at: "2026-07-18T03:00:00.000Z",
    ...overrides,
  };
}

export function successTransaction(order: TenantCreditOrderRecord) {
  return {
    mchid: defaultPaymentConfig.merchant_id,
    out_trade_no: order.out_trade_no,
    transaction_id: `transaction-${order.id}`,
    trade_state: "SUCCESS",
    success_time: "2026-07-18T02:58:00.000Z",
    amount: { total: order.amount_fen, currency: "CNY" },
    requestId: null,
  };
}

export function createMonotonicClock(start = CLOCK_START) {
  let reads = 0;
  return mock(() => {
    const now = new Date(start.getTime() + reads * 1000);
    reads += 1;
    return now;
  });
}

export async function createExpirationHarness(input: {
  orders?: TenantCreditOrderRecord[];
  configs?: PlatformPaymentConfigRecord[];
  leaseSeconds?: number;
} = {}) {
  const orders = input.orders ?? [];
  const claimQueue = [...orders];
  const configs = new Map(
    (input.configs ?? [defaultPaymentConfig]).map((config) => [config.id, config]),
  );
  const calls: string[] = [];
  const claimExpiredOrders = mock(async (_input: {
    batchSize: number;
    leaseSeconds: number;
    excludedOrderIds: string[];
  }) => {
    const order = claimQueue.shift();
    calls.push(`claim:${order?.id ?? "empty"}`);
    return order ? [order] : [];
  });
  const renewCloseClaim = mock(async (renewInput: {
    orderId: string;
    claimToken: string;
    leaseSeconds: number;
  }) => {
    calls.push(`renew:${renewInput.orderId}:${renewInput.claimToken}`);
    return orders.find((order) =>
      order.id === renewInput.orderId &&
      order.close_claim_token === renewInput.claimToken
    ) ?? null;
  });
  const markOrderClosed = mock(async (closeInput: { orderId: string }) => {
    calls.push(`mark:${closeInput.orderId}`);
    return orders.find((order) => order.id === closeInput.orderId) ?? null;
  });
  const releaseCloseClaim = mock(async (releaseInput: {
    orderId: string;
    claimToken: string;
    errorMessage: string | null;
  }) => {
    calls.push(`release:${releaseInput.orderId}:${releaseInput.errorMessage}`);
    return null;
  });
  const findWechatPayConfigById = mock(async (configId: string) =>
    configs.get(configId) ?? null
  );
  const load = mock(async (_ref: string | null) => defaultSecretBundle);
  const queryTransaction = mock(async (_queryInput: { outTradeNo: string }) => ({
    trade_state: "CLOSED",
  }));
  const closeTransaction = mock(async (_closeInput: { outTradeNo: string }) =>
    undefined
  );
  const queryTransactionByOutTradeNo = mock(async (
    queryInput: WechatPayQueryTransactionByOutTradeNoInput,
  ) => {
    calls.push(`query:${orderIdFromTradeNo(queryInput.outTradeNo)}`);
    const transaction = await queryTransaction(queryInput);
    const merchantBinding =
      queryInput.config.merchant_mode === "service_provider_sub_merchant"
        ? {
          sp_mchid: queryInput.config.merchant_id,
          sub_mchid: queryInput.config.sub_merchant_id,
        }
        : { mchid: queryInput.config.merchant_id };
    return {
      ...merchantBinding,
      out_trade_no: queryInput.outTradeNo,
      requestId: null,
      ...transaction,
    };
  });
  const closeTransactionByOutTradeNo = mock(async (closeInput: {
    outTradeNo: string;
  }) => {
    calls.push(`close:${orderIdFromTradeNo(closeInput.outTradeNo)}`);
    return closeTransaction(closeInput);
  });
  const confirm = mock(async (confirmInput: { order: TenantCreditOrderRecord }) => {
    calls.push(`confirm:${confirmInput.order.id}`);
    return {};
  });
  const nowFactory = createMonotonicClock();
  const repository = {
    claimExpiredOrders,
    renewCloseClaim,
    markOrderClosed,
    releaseCloseClaim,
  };
  const paymentConfigRepository = { findWechatPayConfigById };
  const secretBundleService = { load };
  const wechatPayGateway = {
    queryTransactionByOutTradeNo,
    closeTransactionByOutTradeNo,
  };
  const paymentConfirmation = { confirm };
  const { BillingRechargeExpirationService } = await import(
    "./billing-recharge-expiration"
  );
  const service = new BillingRechargeExpirationService({
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    paymentConfirmation,
    nowFactory,
    leaseSeconds: input.leaseSeconds,
  });
  return {
    service,
    calls,
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    paymentConfirmation,
    queryTransaction,
    closeTransaction,
    nowFactory,
  };
}

function orderIdFromTradeNo(outTradeNo: string) {
  return `order-${outTradeNo.replace("WX", "")}`;
}
