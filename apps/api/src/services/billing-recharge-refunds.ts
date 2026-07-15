import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import {
  billingRechargeRefundRepository,
  type TenantCreditRefundRequestRecord,
} from "@/repositories/billing-recharge-refunds";
import type { BillingAccountBalance } from "@/repositories/billing";
import type { AuthContext } from "@/services/authorization";
import { toBillingRechargeOrderView } from "@/services/billing-recharge-views";

export type BillingRechargeRefundRequestInput = {
  reason: string;
  idempotency_key: string;
};

type OrderRepositoryPort = Pick<
  typeof billingRechargeRepository,
  "findOrderById" | "getAccountByTenantId"
>;

type RefundRepositoryPort = Pick<
  typeof billingRechargeRefundRepository,
  | "findByIdempotencyKey"
  | "findActiveByOrderId"
  | "create"
  | "markOrderRefundRequested"
>;

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

export type BillingRechargeRefundServiceDependencies = {
  orderRepository?: OrderRepositoryPort;
  refundRepository?: RefundRepositoryPort;
  accessPolicyService: AccessPolicyPort;
  requestNoFactory?: () => string;
  nowFactory?: () => Date;
};

const RECHARGE_REFUND_REQUEST_PERMISSION = "billing.recharge.refund.request";
const REFUND_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class BillingRechargeRefundService {
  private readonly orderRepository: OrderRepositoryPort;
  private readonly refundRepository: RefundRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly requestNoFactory: () => string;
  private readonly nowFactory: () => Date;

  constructor(dependencies: BillingRechargeRefundServiceDependencies) {
    this.orderRepository =
      dependencies.orderRepository ?? billingRechargeRepository;
    this.refundRepository =
      dependencies.refundRepository ?? billingRechargeRefundRepository;
    this.accessPolicyService = dependencies.accessPolicyService;
    this.requestNoFactory =
      dependencies.requestNoFactory ?? createRefundRequestNo;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async requestRefund(
    authContext: AuthContext,
    orderId: string,
    input: BillingRechargeRefundRequestInput,
  ) {
    const tenantId = this.assertCanRequestRefund(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();

    const order = await this.orderRepository.findOrderById({ tenantId, orderId });
    if (!order) {
      throw Errors.business(
        404,
        "积分充值订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }

    const existing = await this.refundRepository.findByIdempotencyKey({
      tenantId,
      idempotencyKey: input.idempotency_key,
    });
    if (existing) {
      if (existing.order_id !== order.id) {
        throw Errors.business(
          409,
          "退款申请幂等键已用于其他充值订单",
          "BILLING_RECHARGE_REFUND_IDEMPOTENCY_CONFLICT",
        );
      }
      return toRefundRequestResult(existing, order);
    }

    assertOrderRefundable(order);
    const activeRequest = await this.refundRepository.findActiveByOrderId({
      tenantId,
      orderId,
    });
    if (activeRequest) {
      throw Errors.business(
        409,
        "该充值订单已有处理中退款申请",
        "BILLING_RECHARGE_REFUND_REQUEST_PENDING",
      );
    }

    const now = this.nowFactory();
    assertWithinRefundWindow(order, now);
    const requestedCredits = order.credits + (order.bonus_credits ?? 0);
    await this.assertEnoughCredits(tenantId, requestedCredits);

    const request = await this.refundRepository.create({
      tenant_id: tenantId,
      order_id: order.id,
      request_no: this.requestNoFactory(),
      idempotency_key: input.idempotency_key,
      status: "pending_review",
      reason: input.reason.trim(),
      requested_amount_fen: order.paid_amount_fen,
      requested_credits: requestedCredits,
      requested_by_employee_id: authContext.employeeId,
      metadata: {},
    });
    const updatedOrder = await this.refundRepository.markOrderRefundRequested({
      tenantId,
      orderId: order.id,
      refundStatus: "pending_review",
      refundRequestedAt: now.toISOString(),
    });

    return toRefundRequestResult(request, updatedOrder);
  }

  private assertCanRequestRefund(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(
      authContext,
      RECHARGE_REFUND_REQUEST_PERMISSION,
    )) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private async assertEnoughCredits(tenantId: string, requestedCredits: number) {
    const account = await this.orderRepository.getAccountByTenantId(tenantId);
    if (!hasEnoughCredits(account, requestedCredits)) {
      throw Errors.business(
        409,
        "充值积分已消费，无法自助申请退款",
        "BILLING_RECHARGE_CREDITS_CONSUMED",
      );
    }
  }
}

function toRefundRequestResult(
  request: TenantCreditRefundRequestRecord,
  order: TenantCreditOrderRecord,
) {
  return {
    request,
    order: toBillingRechargeOrderView(order),
  };
}

function assertOrderRefundable(order: TenantCreditOrderRecord) {
  if (order.channel !== "wechat_pay") {
    throw Errors.business(
      409,
      "仅微信支付积分充值订单可申请退款",
      "BILLING_RECHARGE_ORDER_CHANNEL_INVALID",
    );
  }

  if (order.status === "refunded" || order.refund_status === "refunded") {
    throw Errors.business(
      409,
      "积分充值订单已退款",
      "BILLING_RECHARGE_ORDER_ALREADY_REFUNDED",
    );
  }

  if (order.status !== "paid") {
    throw Errors.business(
      409,
      "只有已支付积分充值订单可申请退款",
      "BILLING_RECHARGE_ORDER_NOT_PAID",
    );
  }
}

function assertWithinRefundWindow(order: TenantCreditOrderRecord, now: Date) {
  if (!order.paid_at) {
    throw Errors.business(
      409,
      "积分充值订单未记录支付时间",
      "BILLING_RECHARGE_ORDER_NOT_PAID",
    );
  }

  const paidAt = new Date(order.paid_at);
  if (Number.isNaN(paidAt.getTime())) {
    throw Errors.business(
      409,
      "积分充值订单支付时间无效",
      "BILLING_RECHARGE_ORDER_NOT_PAID",
    );
  }

  if (paidAt.getTime() + REFUND_WINDOW_DAYS * DAY_MS < now.getTime()) {
    throw Errors.business(
      409,
      "积分充值订单已超过退款申请窗口",
      "BILLING_RECHARGE_REFUND_WINDOW_EXPIRED",
    );
  }
}

function hasEnoughCredits(
  account: BillingAccountBalance | null,
  requestedCredits: number,
) {
  return Boolean(account && account.available_credits >= requestedCredits);
}

function createRefundRequestNo() {
  return `TRR${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}${
    randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  }`;
}
