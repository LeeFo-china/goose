import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { TenantCreditRefundRequestStatus } from "@/repositories/billing-recharge-refunds";
import {
  platformBillingRechargeRefundRepository,
  type PlatformRechargeRefundRequestRecord,
} from "@/repositories/platform-billing-recharge-refunds";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import {
  assertWechatTransactionMatches,
  getWechatErrorDetailCode,
  toWechatRefundResult,
  uncertainRefundStatusError,
} from "@/services/platform-billing-recharge-refund-wechat";
import {
  wechatPayGateway,
  type WechatPayRequestRefundResult,
} from "@/services/wechat-pay-gateway";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";

type RepositoryPort = Pick<
  typeof platformBillingRechargeRefundRepository,
  | "findRequestById"
  | "markRequestRefunding"
  | "markOrderRefundStatus"
  | "saveWechatRefundResult"
  | "markRequestFailed"
>;

type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig"
>;

type SecretBundleServicePort = Pick<typeof wechatPaySecretBundleService, "load">;
type WechatPayGatewayPort = Pick<
  typeof wechatPayGateway,
  | "queryTransactionByOutTradeNo"
  | "requestRefund"
  | "queryRefundByOutRefundNo"
>;
type AuditLogServicePort = Pick<typeof platformAuditLogService, "recordBestEffort">;

export type PlatformBillingRechargeRefundExecutionServiceDependencies = {
  repository?: RepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  auditLogService?: AuditLogServicePort;
  nowFactory?: () => Date;
};

const REVIEW_PERMISSION = "platform.billing.recharge_refund.review";
const RECHARGE_CHANNEL = "tenant_recharge";
const EXECUTABLE_STATUSES: TenantCreditRefundRequestStatus[] = [
  "approved",
  "failed",
];

export class PlatformBillingRechargeRefundExecutionService {
  private readonly repository: RepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly auditLogService: AuditLogServicePort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: PlatformBillingRechargeRefundExecutionServiceDependencies = {},
  ) {
    this.repository =
      dependencies.repository ?? platformBillingRechargeRefundRepository;
    this.paymentConfigRepository =
      dependencies.paymentConfigRepository ?? platformPaymentConfigRepository;
    this.secretBundleService =
      dependencies.secretBundleService ?? wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.auditLogService =
      dependencies.auditLogService ?? platformAuditLogService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async execute(authContext: AuthContext, requestId: string) {
    this.assertCanExecute(authContext);
    const current = await this.repository.findRequestById(requestId);
    if (!current) throw requestNotFoundError();
    this.assertExecutableRequest(current);

    const order = this.requireOrder(current);
    this.assertWechatPaidOrder(order);
    const transactionId = this.requireTransactionId(order);
    const outTradeNo = this.requireOutTradeNo(order);
    const refundAmountFen = this.requirePositiveAmount(
      current.requested_amount_fen,
      "积分充值退款申请金额不正确",
      "BILLING_RECHARGE_REFUND_AMOUNT_INVALID",
    );
    const totalAmountFen = this.requirePositiveAmount(
      order.paid_amount_fen || order.amount_fen,
      "积分充值订单支付金额不正确",
      "BILLING_RECHARGE_PAID_AMOUNT_INVALID",
    );
    const outRefundNo = this.buildOutRefundNo(current);

    const config = await this.paymentConfigRepository.findWechatPayConfig();
    this.assertPaymentConfigReady(config, order);
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    const wechatTransaction =
      await this.wechatPayGateway.queryTransactionByOutTradeNo({
        config,
        secretBundle,
        outTradeNo,
      });
    assertWechatTransactionMatches({
      wechatTransaction,
      transactionId,
      totalAmountFen,
    });

    const refundingRequest = await this.repository.markRequestRefunding({
      id: requestId,
      fromStatuses: EXECUTABLE_STATUSES,
      outRefundNo,
    });
    if (!refundingRequest) throw invalidExecutionStateError();

    await this.repository.markOrderRefundStatus({
      tenantId: refundingRequest.tenant_id,
      orderId: refundingRequest.order_id,
      refundStatus: "refunding",
    });

    let wechatRefund: WechatPayRequestRefundResult;
    try {
      wechatRefund = await this.wechatPayGateway.requestRefund({
        config,
        secretBundle,
        transactionId,
        outRefundNo,
        reason: current.reason,
        refundAmountFen,
        totalAmountFen,
      });
    } catch (error) {
      try {
        const queriedRefund =
          await this.wechatPayGateway.queryRefundByOutRefundNo({
            config,
            secretBundle,
            outRefundNo,
          });
        wechatRefund = toWechatRefundResult(queriedRefund, outRefundNo);
      } catch (queryError) {
        if (getWechatErrorDetailCode(queryError) === "RESOURCE_NOT_EXISTS") {
          await this.markExecutionFailed({
            authContext,
            request: refundingRequest,
            refundAmountFen,
            error,
          });
          throw error;
        }
        throw uncertainRefundStatusError({
          outRefundNo,
          requestError: error,
          queryError,
        });
      }
    }

    const request = await this.repository.saveWechatRefundResult({
      id: requestId,
      outRefundNo: wechatRefund.out_refund_no,
      wechatRefundId: wechatRefund.refund_id,
      refundAmountFen,
      metadata: {
        ...metadataRecord(refundingRequest.metadata),
        wechat_refund_response: wechatRefund.raw,
        wechat_refund_status: wechatRefund.status,
        wechat_refund_executed_at: this.nowFactory().toISOString(),
      },
    });

    await this.auditExecution({
      authContext,
      before: current,
      after: request,
      wechatRefund,
      refundAmountFen,
    });

    return {
      request,
      wechat_refund: wechatRefund,
    };
  }

  private assertCanExecute(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, REVIEW_PERMISSION)) throw Errors.forbidden();
  }

  private assertExecutableRequest(request: PlatformRechargeRefundRequestRecord) {
    if (!EXECUTABLE_STATUSES.includes(request.status)) {
      throw invalidExecutionStateError();
    }
  }

  private requireOrder(request: PlatformRechargeRefundRequestRecord) {
    if (!request.order) {
      throw Errors.business(
        404,
        "积分充值订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }
    return request.order;
  }

  private assertWechatPaidOrder(order: TenantCreditOrderRecord) {
    if (order.channel !== "wechat_pay") {
      throw Errors.business(
        409,
        "订单不是微信支付积分充值订单",
        "BILLING_RECHARGE_ORDER_CHANNEL_INVALID",
        { channel: order.channel },
      );
    }
    if (order.status !== "paid") {
      throw Errors.business(
        409,
        "只有已支付的积分充值订单可以执行退款",
        "BILLING_RECHARGE_ORDER_NOT_PAID",
        { status: order.status },
      );
    }
  }

  private requireTransactionId(order: TenantCreditOrderRecord) {
    const transactionId = optionalString(order.transaction_id);
    if (!transactionId) {
      throw Errors.business(
        409,
        "积分充值订单缺少微信支付交易号",
        "BILLING_RECHARGE_REFUND_TRANSACTION_ID_REQUIRED",
      );
    }
    return transactionId;
  }

  private requireOutTradeNo(order: TenantCreditOrderRecord) {
    const outTradeNo = optionalString(order.out_trade_no);
    if (!outTradeNo) {
      throw Errors.business(
        409,
        "积分充值订单缺少商户支付单号",
        "BILLING_RECHARGE_REFUND_OUT_TRADE_NO_REQUIRED",
      );
    }
    return outTradeNo;
  }

  private assertPaymentConfigReady(
    config: PlatformPaymentConfigRecord | null,
    order: TenantCreditOrderRecord,
  ): asserts config is PlatformPaymentConfigRecord {
    if (!config || config.status !== "active") {
      throw Errors.business(
        409,
        "平台微信支付配置未启用",
        "PLATFORM_WECHAT_PAY_CONFIG_NOT_ACTIVE",
      );
    }
    if (order.payment_config_id && order.payment_config_id !== config.id) {
      throw Errors.business(
        409,
        "积分充值订单关联的微信支付配置与当前平台配置不一致",
        "BILLING_RECHARGE_PAYMENT_CONFIG_MISMATCH",
        {
          order_payment_config_id: order.payment_config_id,
          active_payment_config_id: config.id,
        },
      );
    }
    if (!config.merchant_id || !config.serial_no) {
      throw Errors.business(
        409,
        "平台微信支付商户号或证书序列号未配置",
        "PLATFORM_WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    if (!config.encrypted_config_ref) {
      throw Errors.business(
        409,
        "平台微信支付密钥引用未配置",
        "PLATFORM_WECHAT_PAY_SECRET_REF_REQUIRED",
      );
    }
    if (!config.enabled_channels.includes(RECHARGE_CHANNEL)) {
      throw Errors.business(
        409,
        "平台微信支付未启用积分充值通道",
        "PLATFORM_WECHAT_PAY_RECHARGE_CHANNEL_DISABLED",
      );
    }
  }

  private requirePositiveAmount(value: number, message: string, code: string) {
    if (!Number.isFinite(value) || value <= 0) {
      throw Errors.business(409, message, code);
    }
    return value;
  }

  private buildOutRefundNo(request: PlatformRechargeRefundRequestRecord) {
    return optionalString(request.out_refund_no) ?? request.request_no.trim();
  }

  private auditExecution(input: {
    authContext: AuthContext;
    before: PlatformRechargeRefundRequestRecord;
    after: PlatformRechargeRefundRequestRecord;
    wechatRefund: WechatPayRequestRefundResult;
    refundAmountFen: number;
  }) {
    return this.auditLogService.recordBestEffort({
      action: "platform_billing_recharge_refund_execute",
      actorEmployeeId: input.authContext.employeeId,
      actorUserId: input.authContext.authUserId,
      targetTenantId: input.after.tenant_id,
      resourceType: "tenant_credit_refund_request",
      resourceId: input.after.id,
      resourceLabel: input.after.request_no,
      summary: "执行微信积分充值退款",
      metadata: {
        before_status: input.before.status,
        after_status: input.after.status,
        order_id: input.after.order_id,
        order_no: input.after.order?.order_no ?? null,
        out_refund_no: input.wechatRefund.out_refund_no,
        wechat_refund_id: input.wechatRefund.refund_id,
        wechat_refund_status: input.wechatRefund.status,
        refund_amount_fen: input.refundAmountFen,
      },
    });
  }

  private async markExecutionFailed(input: {
    authContext: AuthContext;
    request: PlatformRechargeRefundRequestRecord;
    refundAmountFen: number;
    error: unknown;
  }) {
    const failureMessage = getErrorMessage(input.error);
    const failedRequest = await this.repository.markRequestFailed({
      id: input.request.id,
      failureMessage,
      metadata: {
        ...metadataRecord(input.request.metadata),
        wechat_refund_failure: {
          code: getErrorCode(input.error),
          message: failureMessage,
          failed_at: this.nowFactory().toISOString(),
        },
      },
    });
    if (failedRequest) {
      await this.repository.markOrderRefundStatus({
        tenantId: failedRequest.tenant_id,
        orderId: failedRequest.order_id,
        refundStatus: "failed",
      });
    }
    await this.auditExecutionFailure({
      authContext: input.authContext,
      request: failedRequest ?? input.request,
      refundAmountFen: input.refundAmountFen,
      error: input.error,
    });
  }

  private auditExecutionFailure(input: {
    authContext: AuthContext;
    request: PlatformRechargeRefundRequestRecord;
    refundAmountFen: number;
    error: unknown;
  }) {
    return this.auditLogService.recordBestEffort({
      action: "platform_billing_recharge_refund_execute",
      actorEmployeeId: input.authContext.employeeId,
      actorUserId: input.authContext.authUserId,
      targetTenantId: input.request.tenant_id,
      resourceType: "tenant_credit_refund_request",
      resourceId: input.request.id,
      resourceLabel: input.request.request_no,
      status: "failure",
      summary: "执行微信积分充值退款失败",
      metadata: {
        after_status: input.request.status,
        order_id: input.request.order_id,
        order_no: input.request.order?.order_no ?? null,
        out_refund_no: input.request.out_refund_no,
        refund_amount_fen: input.refundAmountFen,
        error_code: getErrorCode(input.error),
        error_message: getErrorMessage(input.error),
      },
    });
  }
}

function hasPermission(authContext: AuthContext, permissionCode: string) {
  return authContext.permissions.some((permission) =>
    permission.code === permissionCode
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requestNotFoundError() {
  return Errors.business(
    404,
    "积分充值退款申请不存在",
    "BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND",
  );
}

function invalidExecutionStateError() {
  return Errors.business(
    409,
    "积分充值退款申请状态不允许执行退款，请刷新后重试",
    "BILLING_RECHARGE_REFUND_EXECUTE_STATE_INVALID",
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error);
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return null;
}

export const platformBillingRechargeRefundExecutionService =
  new PlatformBillingRechargeRefundExecutionService();
