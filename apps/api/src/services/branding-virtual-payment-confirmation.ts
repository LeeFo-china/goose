import { createHash, timingSafeEqual } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import {
  brandingVirtualOrderRepository,
  type BrandingVirtualOrderRecord,
  type BrandingVirtualPurchaseConfirmationResult,
} from "@/repositories/branding-virtual-orders";

export type BrandingVirtualPaymentConfirmationSource =
  | "notification"
  | "query"
  | "reconciliation";

export type BrandingVirtualSuccessfulTransaction = {
  eventType: "xpay_goods_deliver_notify" | "query_order";
  successful: true;
  environment: "sandbox" | "production";
  openid: string;
  outTradeNo: string;
  providerProductId: string;
  quantity: 1;
  currency: "CNY" | null;
  origPriceFen: number;
  actualPriceFen: number;
  providerOrderNo: string;
  transactionId: string;
  paidAt: string;
  attach: string;
};

export type BrandingVirtualPaymentConfirmationInput = {
  source: BrandingVirtualPaymentConfirmationSource;
  order: BrandingVirtualOrderRecord;
  transaction: BrandingVirtualSuccessfulTransaction;
  notificationId: string | null;
  allowLateClosedRecovery?: boolean;
};

type RepositoryPort = Pick<
  typeof brandingVirtualOrderRepository,
  "confirmPurchase"
>;

export class BrandingVirtualPaymentConfirmation {
  constructor(
    private readonly repository: RepositoryPort = brandingVirtualOrderRepository,
  ) {}

  async confirm(
    input: BrandingVirtualPaymentConfirmationInput,
  ): Promise<BrandingVirtualPurchaseConfirmationResult> {
    if (!safeTextEqual(input.order.payer_openid, input.transaction.openid)) {
      throw bindingMismatch(
        "BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH",
        "openid",
      );
    }
    assertTransactionBinding(input.order, input.transaction);

    return this.repository.confirmPurchase({
      orderId: input.order.id,
      notificationId: input.notificationId,
      source: input.source,
      allowLateClosedRecovery: input.allowLateClosedRecovery ?? false,
      ...input.transaction,
    });
  }
}

function assertTransactionBinding(
  order: BrandingVirtualOrderRecord,
  transaction: BrandingVirtualSuccessfulTransaction,
): void {
  if (order.out_trade_no !== transaction.outTradeNo) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH",
      "out_trade_no",
    );
  }
  if (order.environment !== transaction.environment) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH",
      "environment",
    );
  }
  if (order.provider_product_id !== transaction.providerProductId) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH",
      "provider_product_id",
    );
  }
  if (transaction.quantity !== 1) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH",
      "quantity",
    );
  }
  if (transaction.currency !== null && transaction.currency !== "CNY") {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH",
      "currency",
    );
  }
  if (
    transaction.origPriceFen !== order.amount_fen ||
    transaction.actualPriceFen !== order.amount_fen
  ) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH",
      "amount",
    );
  }
  if (transaction.attach !== order.id) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH",
      "attach",
    );
  }
  if (
    order.transaction_id !== null &&
    order.transaction_id !== transaction.transactionId
  ) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT",
      "transaction_id",
    );
  }
  if (
    order.provider_order_no !== null &&
    order.provider_order_no !== transaction.providerOrderNo
  ) {
    throw bindingMismatch(
      "BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT",
      "provider_order_no",
    );
  }
}

function bindingMismatch(code: string, field: string) {
  return Errors.business(
    409,
    "微信虚拟支付事实与订单不一致",
    code,
    { field },
  );
}

function safeTextEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export const brandingVirtualPaymentConfirmation =
  new BrandingVirtualPaymentConfirmation();
