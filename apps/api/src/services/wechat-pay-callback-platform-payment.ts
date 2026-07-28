import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
  type BrandingAddonCallbackOrderRecord,
} from "@/repositories/branding-addon-orders";
import {
  billingRechargeRepository,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import {
  parseAndAssertBrandingAddonCallback,
  type BrandingAddonValidatedSuccessTransaction,
} from "@/services/branding-addon-payment-confirmation";
import {
  buildWechatPayTransactionExpectedBinding,
  convertWechatPayTransactionCallbackResource,
  parseAndAssertWechatPayTransactionCallback,
  type WechatPayValidatedSuccessTransaction,
} from "@/services/wechat-pay-transaction-contract";

type BrandingRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  "findByOutTradeNo"
>;
type CreditRepositoryPort = Pick<
  typeof billingRechargeRepository,
  "findWechatOrderByOutTradeNo"
>;

export type BrandingAddonCallbackContext = {
  kind: "branding_addon";
  config: PlatformPaymentConfigRecord;
  payload: Record<string, unknown>;
  transaction: BrandingAddonValidatedSuccessTransaction;
  order: BrandingAddonCallbackOrderRecord;
};

export type CreditRechargeCallbackContext = {
  kind: "credit_recharge";
  config: PlatformPaymentConfigRecord;
  payload: Record<string, unknown>;
  transaction: WechatPayValidatedSuccessTransaction;
  order: TenantCreditOrderRecord;
};

export class WechatPayPlatformPaymentCallbackMatcher {
  constructor(
    private readonly brandingRepository: BrandingRepositoryPort =
      brandingAddonOrderRepository,
    private readonly creditRepository: CreditRepositoryPort =
      billingRechargeRepository,
  ) {}

  async match(input: {
    config: PlatformPaymentConfigRecord;
    payload: Record<string, unknown>;
    decrypted: Record<string, unknown>;
  }): Promise<
    BrandingAddonCallbackContext | CreditRechargeCallbackContext | null
  > {
    const outTradeNo = requireExactString(
      input.decrypted.out_trade_no,
      "微信支付回调缺少商户订单号",
    );
    const eventType = exactString(input.payload.event_type) ?? "";
    const [creditOrder, brandingOrder] = await Promise.all([
      this.creditRepository.findWechatOrderByOutTradeNo(outTradeNo),
      this.brandingRepository.findByOutTradeNo(outTradeNo),
    ]);
    if (creditOrder && brandingOrder) {
      throw Errors.business(
        409,
        "商户订单号匹配到多个支付业务订单",
        "WECHAT_PAY_CALLBACK_ORDER_AMBIGUOUS",
      );
    }
    if (creditOrder?.payment_config_id === input.config.id) {
      const resource = convertWechatPayTransactionCallbackResource(
        input.decrypted,
      );
      return {
        kind: "credit_recharge",
        config: input.config,
        payload: input.payload,
        transaction: parseAndAssertWechatPayTransactionCallback(
          eventType,
          resource,
          buildWechatPayTransactionExpectedBinding({
            merchantMode: input.config.merchant_mode,
            merchantId: input.config.merchant_id,
            subMerchantId: input.config.sub_merchant_id,
            outTradeNo,
            amountFen: creditOrder.amount_fen,
            transactionId: creditOrder.transaction_id,
          }),
        ),
        order: creditOrder,
      };
    }
    if (brandingOrder?.payment_config_id === input.config.id) {
      return {
        kind: "branding_addon",
        config: input.config,
        payload: input.payload,
        transaction: parseAndAssertBrandingAddonCallback(
          eventType,
          input.decrypted,
          brandingOrder,
        ),
        order: brandingOrder,
      };
    }
    return null;
  }
}

function requireExactString(value: unknown, message: string) {
  const normalized = exactString(value);
  if (!normalized) throw Errors.badRequest(message);
  return normalized;
}

function exactString(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}
