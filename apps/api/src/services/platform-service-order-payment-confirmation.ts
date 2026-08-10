import {
  platformServiceOrderRepository,
  type PlatformServiceOrderRepository,
} from "@/repositories/platform-service-orders";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type { WechatPayValidatedSuccessTransaction } from "@/services/wechat-pay-transaction-contract";

export type PlatformServiceOrderPaymentConfirmationInput = {
  order: OrderRecord;
  transaction: WechatPayValidatedSuccessTransaction;
  notificationId: string | null;
  source: "wechat_callback" | "cancellation_reconcile";
};

type RepositoryPort = Pick<PlatformServiceOrderRepository, "confirmPayment">;

export type PlatformServiceOrderPaymentConfirmationDependencies = {
  repository?: RepositoryPort;
};

export class PlatformServiceOrderPaymentConfirmation {
  private readonly repository: RepositoryPort;

  constructor(
    dependencies: PlatformServiceOrderPaymentConfirmationDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformServiceOrderRepository;
  }

  async confirm(input: PlatformServiceOrderPaymentConfirmationInput) {
    return this.repository.confirmPayment({
      orderId: input.order.id,
      transactionId: input.transaction.transactionId,
      paidAmountFen: input.transaction.amountFen,
      paidAt: input.transaction.successTime,
      notificationId: input.notificationId,
      metadata: {
        confirmation_source: input.source,
        out_trade_no: input.order.out_trade_no ?? input.order.order_no,
      },
    });
  }
}

export const platformServiceOrderPaymentConfirmation =
  new PlatformServiceOrderPaymentConfirmation();
