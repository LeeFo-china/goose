import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
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
  getWechatErrorDetailCode,
  toWechatQueriedRefundPayload,
  toWechatRequestedRefundPayload,
  uncertainRefundStatusError,
} from "@/services/platform-billing-recharge-refund-wechat";
import { wechatPayGateway } from "@/services/wechat-pay-gateway";
import {
  parseAndAssertWechatRefund,
  type WechatRefundApiPayload,
  type WechatRefundValidatedResult,
} from "@/services/wechat-pay-refund-contract";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
} from "@/services/wechat-pay-transaction-contract";

type RepositoryPort = Pick<
  typeof platformBillingRechargeRefundRepository,
  | "findRequestById"
  | "beginWechatRefund"
  | "saveWechatRefundResult"
>;

type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigById"
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
const EXECUTABLE_STATUSES = ["approved", "failed"] as const;

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

    const paymentConfigId = this.requirePaymentConfigId(order);
    const config = await this.paymentConfigRepository.findWechatPayConfigById(
      paymentConfigId,
    );
    this.assertPaymentConfigReady(config, order);
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    const wechatTransactionResponse =
      await this.wechatPayGateway.queryTransactionByOutTradeNo({
        config,
        secretBundle,
        outTradeNo,
      });
    const wechatTransaction = parseAndAssertWechatPayTransactionQuery(
      wechatTransactionResponse,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: config.merchant_mode,
        merchantId: config.merchant_id,
        subMerchantId: config.sub_merchant_id,
        outTradeNo,
        amountFen: totalAmountFen,
        transactionId,
      }),
    );
    if (wechatTransaction.tradeState !== "SUCCESS") {
      throw Errors.business(
        409,
        "微信支付订单不是支付成功状态，不能执行退款",
        "BILLING_RECHARGE_WECHAT_TRANSACTION_NOT_SUCCESS",
        { trade_state: wechatTransaction.tradeState },
      );
    }
    assertWechatPaySuccessTransaction(wechatTransaction);

    const refundingRequest = await this.repository.beginWechatRefund({
      requestId,
      outRefundNo,
      now: this.nowFactory().toISOString(),
    });
    if (!refundingRequest) throw invalidExecutionStateError();

    const refundInput = {
      config,
      secretBundle,
      transactionId,
      outRefundNo,
      reason: current.reason,
      refundAmountFen,
      totalAmountFen,
    };
    let wechatRefundResponse: WechatRefundApiPayload;
    try {
      const requestedRefund =
        await this.wechatPayGateway.requestRefund(refundInput);
      wechatRefundResponse = toWechatRequestedRefundPayload(requestedRefund);
    } catch (error) {
      try {
        const queriedRefund =
          await this.wechatPayGateway.queryRefundByOutRefundNo({
            config,
            secretBundle,
            outRefundNo,
          });
        wechatRefundResponse = toWechatQueriedRefundPayload(queriedRefund);
      } catch (queryError) {
        if (getWechatErrorDetailCode(queryError) === "RESOURCE_NOT_EXISTS") {
          try {
            const retriedRefund =
              await this.wechatPayGateway.requestRefund(refundInput);
            wechatRefundResponse = toWechatRequestedRefundPayload(
              retriedRefund,
            );
          } catch (retryError) {
            throw uncertainRefundStatusError({
              outRefundNo,
              requestError: error,
              queryError: retryError,
            });
          }
        } else {
          throw uncertainRefundStatusError({
            outRefundNo,
            requestError: error,
            queryError,
          });
        }
      }
    }

    const wechatRefund = parseAndAssertWechatRefund(wechatRefundResponse, {
      outRefundNo,
      wechatRefundId: optionalString(current.wechat_refund_id),
      transactionId,
      outTradeNo,
      refundAmountFen,
      totalAmountFen,
      currency: "CNY",
    });
    const request = await this.repository.saveWechatRefundResult({
      id: requestId,
      outRefundNo: wechatRefund.outRefundNo,
      wechatRefundId: wechatRefund.wechatRefundId,
      refundAmountFen: wechatRefund.refundAmountFen,
      metadata: {
        ...withoutWechatRefundResponse(refundingRequest.metadata),
        wechat_refund_status: wechatRefund.status,
        wechat_request_id: wechatRefund.requestId,
        wechat_refund_executed_at: this.nowFactory().toISOString(),
      },
    });

    await this.auditExecution({
      authContext,
      before: current,
      after: request,
      wechatRefund,
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
    if (!EXECUTABLE_STATUSES.some((status) => status === request.status)) {
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

  private requirePaymentConfigId(order: TenantCreditOrderRecord) {
    const paymentConfigId = optionalString(order.payment_config_id);
    if (!paymentConfigId) {
      throw Errors.business(
        409,
        "积分充值订单缺少原支付配置",
        "BILLING_RECHARGE_PAYMENT_CONFIG_REQUIRED",
      );
    }
    return paymentConfigId;
  }

  private assertPaymentConfigReady(
    config: PlatformPaymentConfigRecord | null,
    order: TenantCreditOrderRecord,
  ): asserts config is PlatformPaymentConfigRecord {
    if (!config) {
      throw Errors.business(
        409,
        "积分充值订单关联的原支付配置不存在",
        "BILLING_RECHARGE_PAYMENT_CONFIG_NOT_FOUND",
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
    wechatRefund: WechatRefundValidatedResult;
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
        out_refund_no: input.wechatRefund.outRefundNo,
        wechat_refund_id: input.wechatRefund.wechatRefundId,
        wechat_refund_status: input.wechatRefund.status,
        wechat_request_id: input.wechatRefund.requestId,
        refund_amount_fen: input.wechatRefund.refundAmountFen,
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

function withoutWechatRefundResponse(value: unknown) {
  return Object.fromEntries(
    Object.entries(metadataRecord(value)).filter(
      ([key]) => key !== "wechat_refund_response",
    ),
  );
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

export const platformBillingRechargeRefundExecutionService =
  new PlatformBillingRechargeRefundExecutionService();
