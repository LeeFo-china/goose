import { Errors } from "@/errors/error-factory";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import type {
  CancelableServiceOrderRecord,
  ServiceOrderCancellationResult,
} from "@/repositories/platform-service-order-cancellations";
import {
  platformServiceOrderCancellationRepository,
} from "@/repositories/platform-service-order-cancellations";
import type {
  OrderRecord,
} from "@/repositories/platform-service-order-records";
import type { ServiceOrderCancelInput } from "@/schema/billing-service-orders";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  platformServiceOrderPaymentConfirmation,
  PlatformServiceOrderPaymentConfirmation,
} from "@/services/platform-service-order-payment-confirmation";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import { serializeTenantServiceOrder } from "@/services/platform-service-order-views";
import { requireOrderPaymentConfig } from "@/services/tenant-platform-service-order-payment-config";
import type {
  WechatPayGateway,
  WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway";
import { wechatPayGateway } from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
  type WechatPayValidatedSuccessTransaction,
  type WechatPayValidatedTransaction,
} from "@/services/wechat-pay-transaction-contract";

type CancellationRepositoryPort = {
  claim: (input: {
    tenantId: string;
    orderId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason: ServiceOrderCancelInput["reason"];
    employeeId: string;
  }) => Promise<ServiceOrderCancellationResult>;
  finalize: (input: {
    tenantId: string;
    orderId: string;
    expectedVersion: number;
    idempotencyKey: string;
    requireMissingPrepay: boolean;
  }) => Promise<ServiceOrderCancellationResult>;
};

export type CancellationDependencies = {
  repository: CancellationRepositoryPort;
  paymentConfigRepository: {
    findWechatPayConfigById: (
      configId: string,
    ) => Promise<PlatformPaymentConfigRecord | null>;
  };
  secretBundleService: {
    load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
  };
  wechatPayGateway: Pick<
    WechatPayGateway,
    "queryTransactionByOutTradeNo" | "closeTransactionByOutTradeNo"
  >;
  paymentConfirmation: Pick<PlatformServiceOrderPaymentConfirmation, "confirm">;
  nowFactory: () => Date;
};

export async function cancelTenantPlatformServiceOrder(input: {
  dependencies: CancellationDependencies;
  tenantId: string;
  employeeId: string;
  orderId: string;
  request: ServiceOrderCancelInput;
}) {
  const claim = await input.dependencies.repository.claim({
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion: input.request.expected_version,
    idempotencyKey: input.request.idempotency_key,
    reason: input.request.reason,
    employeeId: input.employeeId,
  });
  if (claim.errorCode) throwCancelResultError(claim.errorCode);
  const order = claim.order;
  if (!order) throwOrderNotFound();
  if (order.payment_status === "closed") {
    return buildResponse(order, true, input.dependencies.nowFactory());
  }
  assertPendingOrder(order);

  const context = await loadPaymentContext(input.dependencies, order);
  let transaction: WechatPayValidatedTransaction;
  let closeRequestFailed = false;
  try {
    transaction = await queryTransaction(input.dependencies, context, order);
  } catch (error) {
    if (canCloseNonexistentWechatOrder(order, error)) {
      return closeLocalOrder(input, true);
    }
    throw error;
  }

  if (transaction.tradeState === "SUCCESS") {
    await recoverPaidOrder(input.dependencies, order, transaction);
    throwAlreadyPaid();
  }
  if (transaction.tradeState === "CLOSED") return closeLocalOrder(input, false);
  if (transaction.tradeState !== "NOTPAY") throwWechatStateUncertain();

  try {
    await input.dependencies.wechatPayGateway.closeTransactionByOutTradeNo({
      config: context.config,
      outTradeNo: requireOutTradeNo(order),
      secretBundle: context.secretBundle,
    });
  } catch {
    closeRequestFailed = true;
    // A close timeout is ambiguous, so the authoritative follow-up query
    // still decides whether the local order may be closed.
  }

  let reconciled: WechatPayValidatedTransaction;
  try {
    reconciled = await queryTransaction(input.dependencies, context, order);
  } catch (error) {
    if (canCloseNonexistentWechatOrder(order, error)) {
      return closeLocalOrder(input, true);
    }
    throwWechatStateUncertain(closeRequestFailed);
  }
  if (reconciled.tradeState === "SUCCESS") {
    await recoverPaidOrder(input.dependencies, order, reconciled);
    throwAlreadyPaid();
  }
  if (reconciled.tradeState === "CLOSED") {
    return closeLocalOrder(input, false);
  }
  throwWechatStateUncertain(closeRequestFailed);
}

async function loadPaymentContext(
  dependencies: CancellationDependencies,
  order: OrderRecord,
) {
  const configId = exactText(order.payment_config_id);
  if (!configId) throwPaymentConfigInvalid();
  const config = requireOrderPaymentConfig(
    await dependencies.paymentConfigRepository.findWechatPayConfigById(
      configId,
    ),
    order,
  );
  const secretBundle = requireMatchingPlatformPaymentSecretBundle(
    config,
    await dependencies.secretBundleService.load(config.encrypted_config_ref),
  );
  return { config, secretBundle };
}

async function queryTransaction(
  dependencies: CancellationDependencies,
  context: {
    config: PlatformPaymentConfigRecord;
    secretBundle: WechatPaySecretBundle;
  },
  order: OrderRecord,
) {
  const payload: WechatPayTransactionQueryResult = await dependencies
    .wechatPayGateway.queryTransactionByOutTradeNo({
      config: context.config,
      outTradeNo: requireOutTradeNo(order),
      secretBundle: context.secretBundle,
    });
  const transaction = parseAndAssertWechatPayTransactionQuery(
    payload,
    buildWechatPayTransactionExpectedBinding({
      merchantMode: "direct_merchant",
      merchantId: context.config.merchant_id,
      subMerchantId: null,
      outTradeNo: requireOutTradeNo(order),
      amountFen: order.amount_fen,
      transactionId: order.transaction_id ?? null,
    }),
  );
  const expectedAppid = context.config.sub_app_id || context.config.app_id;
  if (!expectedAppid || transaction.appid !== expectedAppid) {
    throw Errors.business(
      502,
      "微信支付交易与平台服务订单不一致",
      "SERVICE_PAYMENT_TRANSACTION_MISMATCH",
      { field: "appid" },
    );
  }
  return transaction;
}

async function recoverPaidOrder(
  dependencies: CancellationDependencies,
  order: OrderRecord,
  transaction: WechatPayValidatedSuccessTransaction | WechatPayValidatedTransaction,
) {
  assertWechatPaySuccessTransaction(transaction);
  await dependencies.paymentConfirmation.confirm({
    order,
    transaction,
    notificationId: null,
    source: "cancellation_reconcile",
  });
}

async function closeLocalOrder(input: {
  dependencies: CancellationDependencies;
  tenantId: string;
  employeeId: string;
  orderId: string;
  request: ServiceOrderCancelInput;
}, requireMissingPrepay: boolean) {
  const result = await input.dependencies.repository.finalize({
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedVersion: input.request.expected_version,
    idempotencyKey: input.request.idempotency_key,
    requireMissingPrepay,
  });
  if (result.errorCode) throwCancelResultError(result.errorCode);
  if (!result.order) throwOrderNotFound();
  return buildResponse(
    result.order,
    result.idempotent,
    input.dependencies.nowFactory(),
  );
}

function buildResponse(order: OrderRecord, idempotent: boolean, now: Date) {
  return {
    idempotent,
    order: serializeTenantServiceOrder(order, now, {
      canCancelPayment: true,
    }),
    server_time: now.toISOString(),
  };
}

function assertPendingOrder(order: OrderRecord) {
  if (order.payment_status === "paid") throwAlreadyPaid();
  if (order.payment_status !== "pending") {
    throw Errors.business(
      409,
      "平台服务订单当前状态不允许取消",
      "SERVICE_ORDER_CANCEL_NOT_ALLOWED",
    );
  }
}

function throwCancelResultError(code: string): never {
  if (code === "SERVICE_ORDER_NOT_FOUND") throwOrderNotFound();
  if (code === "SERVICE_ORDER_ALREADY_PAID") throwAlreadyPaid();
  if (code === "SERVICE_ORDER_VERSION_CONFLICT") {
    throw Errors.business(
      409,
      "平台服务订单已更新，请刷新后重试",
      code,
    );
  }
  if (code === "SERVICE_ORDER_ACTOR_INVALID") throw Errors.forbidden();
  if (code === "SERVICE_ORDER_IDEMPOTENCY_CONFLICT") {
    throw Errors.business(409, "幂等键已用于其他订单", code);
  }
  if (code === "SERVICE_ORDER_CANCEL_IN_PROGRESS") {
    throw Errors.business(409, "平台服务订单正在取消，请复用原请求重试", code);
  }
  if (code === "SERVICE_ORDER_CANCEL_PREPAY_CHANGED") {
    throw Errors.business(409, "订单支付状态已变化，请刷新后重试", code);
  }
  if (code === "VALIDATION_ERROR") {
    throw Errors.badRequest("取消订单参数无效");
  }
  throw Errors.business(
    409,
    "平台服务订单当前状态不允许取消",
    "SERVICE_ORDER_CANCEL_NOT_ALLOWED",
  );
}

function canCloseNonexistentWechatOrder(order: OrderRecord, error: unknown) {
  if (exactText(order.prepay_id)) return false;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; details?: unknown };
  if (candidate.code !== "WECHAT_PAY_TRANSACTION_QUERY_FAILED") return false;
  if (!candidate.details || typeof candidate.details !== "object") return false;
  const details = candidate.details as { status?: unknown; code?: unknown };
  return details.status === 404 && details.code === "ORDER_NOT_EXIST";
}

function requireOutTradeNo(order: OrderRecord) {
  const outTradeNo = exactText(order.out_trade_no) ?? exactText(order.order_no);
  if (!outTradeNo) {
    throw Errors.business(
      409,
      "平台服务支付参数缺失",
      "SERVICE_PAYMENT_CONFIG_INVALID",
    );
  }
  return outTradeNo;
}

function exactText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function throwOrderNotFound(): never {
  throw Errors.business(404, "平台服务订单不存在", "SERVICE_ORDER_NOT_FOUND");
}

function throwAlreadyPaid(): never {
  throw Errors.business(
    409,
    "平台服务订单已支付，不能取消",
    "SERVICE_ORDER_ALREADY_PAID",
  );
}

function throwWechatStateUncertain(closeRequestFailed = false): never {
  throw Errors.business(
    502,
    "微信支付订单状态暂未确认，请稍后重试",
    "SERVICE_ORDER_CANCEL_WECHAT_UNCERTAIN",
    { close_request_failed: closeRequestFailed },
  );
}

function throwPaymentConfigInvalid(): never {
  throw Errors.business(
    409,
    "平台服务微信支付配置不可用",
    "SERVICE_PAYMENT_CONFIG_INVALID",
  );
}

type CancellationAccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

export class TenantPlatformServiceOrderCancellationService {
  constructor(
    private readonly dependencies: CancellationDependencies = {
      repository: platformServiceOrderCancellationRepository,
      paymentConfigRepository: platformPaymentConfigRepository,
      secretBundleService: wechatPaySecretBundleService,
      wechatPayGateway,
      paymentConfirmation: platformServiceOrderPaymentConfirmation,
      nowFactory: () => new Date(),
    },
    private readonly accessPolicy: CancellationAccessPolicyPort =
      accessPolicyService,
  ) {}

  async cancel(
    authContext: AuthContext,
    orderId: string,
    request: ServiceOrderCancelInput,
  ) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !this.accessPolicy.hasPermission(
        authContext,
        "billing.service_order.create",
      ) || !authContext.employeeId
    ) {
      throw Errors.forbidden();
    }
    return cancelTenantPlatformServiceOrder({
      dependencies: this.dependencies,
      tenantId,
      employeeId: authContext.employeeId,
      orderId,
      request,
    });
  }
}

export const tenantPlatformServiceOrderCancellationService =
  new TenantPlatformServiceOrderCancellationService();
