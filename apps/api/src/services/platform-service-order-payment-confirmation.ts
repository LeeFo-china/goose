import { z } from "zod";

import { Errors } from "@/errors/error-factory";
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

const AtomicTrialConversionSchema = z.object({
  order: z.object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    transaction_id: z.string().trim().min(1),
    source_trial_id: z.uuid().nullable(),
  }).passthrough(),
  conversion_anomaly: z.object({
    code: z.literal("TRIAL_ALREADY_ATTRIBUTED"),
    trial_id: z.uuid(),
    order_id: z.uuid(),
    attributed_order_id: z.uuid(),
  }).strict().nullable(),
}).passthrough();

export class PlatformServiceOrderPaymentConfirmation {
  private readonly repository: RepositoryPort;

  constructor(
    dependencies: PlatformServiceOrderPaymentConfirmationDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformServiceOrderRepository;
  }

  async confirm(input: PlatformServiceOrderPaymentConfirmationInput) {
    const result = await this.repository.confirmPayment({
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
    const parsed = AtomicTrialConversionSchema.safeParse(result);
    const expectedSourceTrialId = input.order.source_trial_id ?? null;
    if (
      !parsed.success
      || parsed.data.order.id !== input.order.id
      || parsed.data.order.tenant_id !== input.order.tenant_id
      || parsed.data.order.transaction_id !== input.transaction.transactionId
      || parsed.data.order.source_trial_id !== expectedSourceTrialId
      || parsed.data.conversion_anomaly !== null && (
        parsed.data.conversion_anomaly.trial_id !== expectedSourceTrialId
        || parsed.data.conversion_anomaly.order_id !== input.order.id
        || parsed.data.conversion_anomaly.attributed_order_id === input.order.id
      )
    ) {
      throw Errors.dbError("确认平台技术服务支付失败");
    }
    return result;
  }
}

export const platformServiceOrderPaymentConfirmation =
  new PlatformServiceOrderPaymentConfirmation();
