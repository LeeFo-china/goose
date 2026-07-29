import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
  type BrandingAddonCallbackOrderRecord,
} from "@/repositories/branding-addon-orders";
import {
  buildWechatPayTransactionExpectedBinding,
  convertWechatPayTransactionCallbackResource,
  parseAndAssertWechatPayTransactionCallback,
  type WechatPayValidatedSuccessTransaction,
} from "@/services/wechat-pay-transaction-contract";

export type BrandingAddonPaymentConfirmationSource =
  | "wechat_callback"
  | "expiration_reconcile";

export type BrandingAddonValidatedSuccessTransaction =
  WechatPayValidatedSuccessTransaction & {
    appid: string;
  };

export type BrandingAddonPaymentConfirmationInput = {
  order: BrandingAddonCallbackOrderRecord;
  transaction: BrandingAddonValidatedSuccessTransaction;
  notificationId: string | null;
  source: BrandingAddonPaymentConfirmationSource;
};

type RepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  "confirmPurchase"
>;

export class BrandingAddonPaymentConfirmation {
  constructor(
    private readonly repository: RepositoryPort =
      brandingAddonOrderRepository,
  ) {}

  async confirm(input: BrandingAddonPaymentConfirmationInput) {
    return this.repository.confirmPurchase({
      orderId: input.order.id,
      outTradeNo: input.transaction.outTradeNo,
      transactionId: input.transaction.transactionId,
      paidAmountFen: input.transaction.amountFen,
      paidAt: input.transaction.successTime,
      mchid: input.transaction.merchantId,
      appid: input.transaction.appid,
      notificationId: input.notificationId,
      metadata: {
        confirmation_source: input.source,
        out_trade_no: input.order.out_trade_no,
      },
    });
  }
}

export function parseAndAssertBrandingAddonCallback(
  eventType: string,
  resource: Record<string, unknown>,
  order: BrandingAddonCallbackOrderRecord,
): BrandingAddonValidatedSuccessTransaction {
  try {
    const transaction = parseAndAssertWechatPayTransactionCallback(
      eventType,
      convertWechatPayTransactionCallbackResource(resource),
      buildWechatPayTransactionExpectedBinding({
        merchantMode: "direct_merchant",
        merchantId: order.payment_mchid,
        subMerchantId: null,
        outTradeNo: order.out_trade_no,
        amountFen: order.amount_fen,
        transactionId: order.transaction_id,
      }),
    );
    const appid = exactString(resource.appid);
    if (appid !== order.payment_appid) {
      throw callbackContextMismatch("appid");
    }
    return { ...transaction, appid };
  } catch (error) {
    if (readErrorCode(error)?.startsWith("BRANDING_ADDON_")) throw error;
    const field = readErrorField(error);
    if (field === "amount.total") throw callbackAmountMismatch();
    if (
      readErrorCode(error) ===
        "BILLING_RECHARGE_WECHAT_TRANSACTION_EVENT_MISMATCH" ||
      readErrorCode(error) ===
        "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH" ||
      readErrorCode(error) ===
        "BILLING_RECHARGE_WECHAT_TRANSACTION_BINDING_INVALID"
    ) {
      throw callbackContextMismatch(field ?? "transaction");
    }
    throw Errors.business(
      502,
      "微信支付交易与品牌权益订单不一致",
      "BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH",
    );
  }
}

function callbackAmountMismatch() {
  return Errors.business(
    409,
    "微信支付回调金额与品牌权益订单不一致",
    "BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH",
    { field: "amount.total" },
  );
}

function callbackContextMismatch(field: string) {
  return Errors.business(
    409,
    "微信支付回调与品牌权益订单不一致",
    "BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH",
    { field },
  );
}

function exactString(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function readErrorField(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const field = (details as { field?: unknown }).field;
  return typeof field === "string" ? field : null;
}

export const brandingAddonPaymentConfirmation =
  new BrandingAddonPaymentConfirmation();
