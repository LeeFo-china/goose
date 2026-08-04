import { Errors } from "@/errors/error-factory";
import type {
  OrderRecord,
  RefundReviewResult,
} from "@/repositories/platform-service-order-records";
import type { ServiceRefundRequestInput } from "@/schema/billing-service-orders";
import type { AuthContext } from "@/services/authorization";
import { serializeTenantServiceOrder } from "@/services/platform-service-order-views";

export type ServiceOrderRefundRepositoryPort = {
  findOrderByTenantAndId(input: {
    tenantId: string;
    orderId: string;
  }): Promise<OrderRecord | null>;
  requestRefundReview(input: {
    tenantId: string;
    orderId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
    createdByEmployeeId: string;
  }): Promise<RefundReviewResult>;
};

export type ServiceOrderRefundAccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

const REFUND_PERMISSION = "billing.service_order.refund.request";

export async function requestServiceOrderRefund(input: {
  authContext: AuthContext;
  orderId: string;
  request: ServiceRefundRequestInput;
  repository: ServiceOrderRefundRepositoryPort;
  accessPolicyService: ServiceOrderRefundAccessPolicyPort;
  nowFactory: () => Date;
}) {
  const tenantId = assertCanRefund(input.authContext, input.accessPolicyService);
  const employeeId = requireEmployee(input.authContext);
  const order = await requireTenantOrder(
    input.repository,
    tenantId,
    input.orderId,
  );
  assertOrderVersion(order, input.request.expected_version);
  if (order.payment_status !== "paid") {
    throw Errors.business(
      409,
      "只有已支付服务订单可以申请售后",
      "SERVICE_ORDER_INVALID_STATE",
    );
  }
  const result = await input.repository.requestRefundReview({
    tenantId,
    orderId: input.orderId,
    expectedVersion: input.request.expected_version,
    idempotencyKey: input.request.idempotency_key,
    reason: input.request.reason,
    createdByEmployeeId: employeeId,
  });
  if (!result.refundRequest || !result.order) {
    throw Errors.business(
      409,
      "平台服务订单已更新，请刷新后重试",
      result.errorCode ?? "SERVICE_ORDER_VERSION_CONFLICT",
    );
  }
  return {
    idempotent: result.idempotent,
    refund_request: result.refundRequest,
    order: serializeTenantServiceOrder(result.order, input.nowFactory()),
  };
}

function assertCanRefund(
  authContext: AuthContext,
  accessPolicyService: ServiceOrderRefundAccessPolicyPort,
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  if (!accessPolicyService.hasPermission(authContext, REFUND_PERMISSION)) {
    throw Errors.forbidden();
  }
  return tenantId;
}

function requireEmployee(authContext: AuthContext) {
  if (!authContext.employeeId) throw Errors.forbidden();
  return authContext.employeeId;
}

async function requireTenantOrder(
  repository: ServiceOrderRefundRepositoryPort,
  tenantId: string,
  orderId: string,
) {
  const order = await repository.findOrderByTenantAndId({ tenantId, orderId });
  if (!order) {
    throw Errors.business(
      404,
      "平台服务订单不存在",
      "SERVICE_ORDER_NOT_FOUND",
    );
  }
  return order;
}

function assertOrderVersion(order: OrderRecord, expectedVersion: number) {
  if (order.version !== expectedVersion) {
    throw Errors.business(
      409,
      "平台服务订单已更新，请刷新后重试",
      "SERVICE_ORDER_VERSION_CONFLICT",
    );
  }
}
