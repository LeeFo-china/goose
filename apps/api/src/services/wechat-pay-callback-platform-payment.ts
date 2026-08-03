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
  platformServiceOrderRepository,
} from "@/repositories/platform-service-orders";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
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
type ServiceOrderRepositoryPort = Pick<
  typeof platformServiceOrderRepository,
  "findOrderByOutTradeNo"
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

export type PlatformServiceOrderCallbackContext = {
  kind: "platform_service_order";
  config: PlatformPaymentConfigRecord;
  payload: Record<string, unknown>;
  transaction: WechatPayValidatedSuccessTransaction;
  order: OrderRecord;
};

export class WechatPayPlatformPaymentCallbackMatcher {
  constructor(
    private readonly brandingRepository: BrandingRepositoryPort =
      brandingAddonOrderRepository,
    private readonly creditRepository: CreditRepositoryPort =
      billingRechargeRepository,
    private readonly serviceOrderRepository: ServiceOrderRepositoryPort =
      platformServiceOrderRepository,
  ) {}

  async match(input: {
    config: PlatformPaymentConfigRecord;
    payload: Record<string, unknown>;
    decrypted: Record<string, unknown>;
  }): Promise<
    | BrandingAddonCallbackContext
    | CreditRechargeCallbackContext
    | PlatformServiceOrderCallbackContext
    | null
  > {
    const outTradeNo = requireExactString(
      input.decrypted.out_trade_no,
      "微信支付回调缺少商户订单号",
    );
    const eventType = exactString(input.payload.event_type) ?? "";
    const [creditOrder, brandingOrder, serviceOrder] = await Promise.all([
      this.creditRepository.findWechatOrderByOutTradeNo(outTradeNo),
      this.brandingRepository.findByOutTradeNo(outTradeNo),
      input.config.enabled_channels.includes("platform_service")
        ? this.serviceOrderRepository.findOrderByOutTradeNo(outTradeNo)
        : Promise.resolve(null),
    ]);
    const boundCreditOrder = creditOrder?.payment_config_id === input.config.id
      ? creditOrder
      : null;
    const boundBrandingOrder =
      brandingOrder?.payment_config_id === input.config.id
        ? brandingOrder
        : null;
    const boundServiceOrder =
      serviceOrder?.payment_config_id === input.config.id
        ? serviceOrder
        : null;
    const matchCount = [
      boundCreditOrder,
      boundBrandingOrder,
      boundServiceOrder,
    ].filter(Boolean).length;
    if (matchCount > 1) {
      throw Errors.business(
        409,
        "商户订单号匹配到多个支付业务订单",
        "WECHAT_PAY_CALLBACK_ORDER_AMBIGUOUS",
      );
    }
    if (boundCreditOrder) {
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
            amountFen: boundCreditOrder.amount_fen,
            transactionId: boundCreditOrder.transaction_id,
          }),
        ),
        order: boundCreditOrder,
      };
    }
    if (boundBrandingOrder) {
      return {
        kind: "branding_addon",
        config: input.config,
        payload: input.payload,
        transaction: parseAndAssertBrandingAddonCallback(
          eventType,
          input.decrypted,
          boundBrandingOrder,
        ),
        order: boundBrandingOrder,
      };
    }
    if (boundServiceOrder) {
      const resource = convertWechatPayTransactionCallbackResource(
        input.decrypted,
      );
      const transaction = parseAndAssertWechatPayTransactionCallback(
        eventType,
        resource,
        buildWechatPayTransactionExpectedBinding({
          merchantMode: input.config.merchant_mode,
          merchantId: input.config.merchant_id,
          subMerchantId: input.config.sub_merchant_id,
          outTradeNo,
          amountFen: boundServiceOrder.amount_fen,
          transactionId: boundServiceOrder.transaction_id ?? null,
        }),
      );
      assertServiceAppidMatches(transaction.appid, input.config);
      return {
        kind: "platform_service_order",
        config: input.config,
        payload: input.payload,
        transaction,
        order: boundServiceOrder,
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

function assertServiceAppidMatches(
  appid: string | null,
  config: PlatformPaymentConfigRecord,
) {
  const expected = config.sub_app_id || config.app_id;
  if (!expected || appid !== expected) {
    throw Errors.business(
      502,
      "微信支付交易与本地平台服务订单不一致",
      "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
      { field: "appid" },
    );
  }
}
