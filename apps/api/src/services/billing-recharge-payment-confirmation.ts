import {
  billingRechargeRepository,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import type { WechatPayValidatedSuccessTransaction } from "@/services/wechat-pay-transaction-contract";

export type BillingRechargePaymentConfirmationSource =
  | "wechat_callback"
  | "expiration_reconcile";

export type BillingRechargePaymentConfirmationInput = {
  order: TenantCreditOrderRecord;
  transaction: WechatPayValidatedSuccessTransaction;
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
    return this.repository.confirmWechatRecharge({
      orderId: input.order.id,
      transactionId: input.transaction.transactionId,
      paidAmountFen: input.transaction.amountFen,
      paidAt: input.transaction.successTime,
      notificationId: input.notificationId,
      metadata: {
        confirmation_source: input.source,
        out_trade_no: input.order.out_trade_no,
      },
    });
  }
}

export const billingRechargePaymentConfirmation =
  new BillingRechargePaymentConfirmation();
