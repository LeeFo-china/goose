import { beforeEach, describe, expect, test } from "bun:test";

import {
  auditLogService,
  authContext,
  createTransactionQueryResult,
  partnerPaymentConfig,
  paymentConfig,
  paymentConfigRepository,
  repository,
  resetExecutionMocks,
  secretBundleService,
  wechatPayGateway,
} from "@/services/platform-billing-recharge-refund-execution.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const mismatchCases = [
  ["direct mchid", paymentConfig, { mchid: "1112582522" }],
  ["partner sp_mchid", partnerPaymentConfig, { sp_mchid: "1561816122" }],
  ["partner sub_mchid", partnerPaymentConfig, { sub_mchid: "1900000110" }],
  ["direct out_trade_no", paymentConfig, { out_trade_no: "TC-OTHER" }],
  ["partner out_trade_no", partnerPaymentConfig, { out_trade_no: "TC-OTHER" }],
  [
    "direct currency",
    paymentConfig,
    { amount: { total: 10000, currency: "USD" } },
  ],
  [
    "partner currency",
    partnerPaymentConfig,
    { amount: { total: 10000, currency: "USD" } },
  ],
  ["direct success_time", paymentConfig, { success_time: "2026-07-02 16:03:00" }],
  ["partner success_time", partnerPaymentConfig, { success_time: undefined }],
  ["direct missing requestId", paymentConfig, { requestId: undefined }],
  ["partner missing requestId", partnerPaymentConfig, { requestId: null }],
  ["partner empty requestId", partnerPaymentConfig, { requestId: "" }],
] as const;

describe("manual recharge refund transaction binding", () => {
  beforeEach(() => resetExecutionMocks());

  test.each(mismatchCases)(
    "rejects mismatched %s before entering refunding",
    async (_name, config, overrides) => {
      paymentConfigRepository.findWechatPayConfigById.mockImplementationOnce(
        async () => config,
      );
      wechatPayGateway.queryTransactionByOutTradeNo.mockImplementationOnce(
        async () => createTransactionQueryResult(config, { ...overrides }),
      );
      const service = await createService();

      await expect(service.execute(authContext, "refund-request-1"))
        .rejects.toMatchObject({
          code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
        });
      expect(repository.beginWechatRefund).not.toHaveBeenCalled();
      expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
      expect(wechatPayGateway.queryTransactionByOutTradeNo)
        .toHaveBeenCalledTimes(1);
    },
  );
});

async function createService() {
  const { PlatformBillingRechargeRefundExecutionService } = await import(
    "./platform-billing-recharge-refund-execution"
  );
  return new PlatformBillingRechargeRefundExecutionService({
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    auditLogService,
    nowFactory: () => new Date("2026-07-18T04:00:00.000Z"),
  });
}
