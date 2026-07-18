import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";

export type BillingRechargePaymentConfirmationSource =
  | "wechat_callback"
  | "expiration_reconcile";

export type BillingRechargePaymentConfirmationInput = {
  order: TenantCreditOrderRecord;
  transaction: Record<string, unknown>;
  notificationId: string | null;
  source: BillingRechargePaymentConfirmationSource;
};

type RepositoryPort = Pick<
  typeof billingRechargeRepository,
  "confirmWechatRecharge"
>;

export type BillingRechargePaymentConfirmationDependencies = {
  repository?: RepositoryPort;
};

export class BillingRechargePaymentConfirmation {
  private readonly repository: RepositoryPort;

  constructor(
    dependencies: BillingRechargePaymentConfirmationDependencies = {},
  ) {
    this.repository = dependencies.repository ?? billingRechargeRepository;
  }

  async confirm(input: BillingRechargePaymentConfirmationInput) {
    const tradeState = optionalString(input.transaction.trade_state);
    if (tradeState !== "SUCCESS") {
      throw Errors.business(
        409,
        "微信支付交易状态不是支付成功",
        "BILLING_RECHARGE_TRANSACTION_NOT_SUCCESS",
        { trade_state: tradeState },
      );
    }

    const transactionId = optionalString(input.transaction.transaction_id);
    if (!transactionId) {
      throw Errors.business(
        502,
        "微信支付交易号缺失",
        "BILLING_RECHARGE_TRANSACTION_ID_REQUIRED",
      );
    }

    const paidAmountFen = getIntegerAmountTotal(input.transaction.amount);
    if (paidAmountFen !== input.order.amount_fen) {
      throw Errors.business(
        409,
        "微信支付金额与积分充值订单金额不一致",
        "BILLING_RECHARGE_AMOUNT_MISMATCH",
        {
          order_amount_fen: input.order.amount_fen,
          wechat_amount_fen: paidAmountFen,
          out_trade_no: input.order.out_trade_no,
        },
      );
    }

    return this.repository.confirmWechatRecharge({
      orderId: input.order.id,
      transactionId,
      paidAmountFen,
      paidAt: optionalString(input.transaction.success_time) ??
        new Date().toISOString(),
      notificationId: input.notificationId,
      metadata: {
        confirmation_source: input.source,
        out_trade_no: input.order.out_trade_no,
      },
    });
  }
}

function getIntegerAmountTotal(amount: unknown) {
  if (!amount || typeof amount !== "object" || Array.isArray(amount)) {
    return null;
  }
  const total = (amount as Record<string, unknown>).total;
  return typeof total === "number" && Number.isInteger(total) ? total : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const billingRechargePaymentConfirmation =
  new BillingRechargePaymentConfirmation();
