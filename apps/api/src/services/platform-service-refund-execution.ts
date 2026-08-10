import { Errors } from "../errors/error-factory";
import {
  platformServiceFulfillmentRepository,
  type PlatformServiceFulfillmentRepository,
} from "../repositories/platform-service-fulfillment";
import type {
  ConfirmServiceRefundInput,
  RefundExecutionRequestRecord,
} from "../repositories/platform-service-rpc-results";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "../repositories/platform-payment-configs";
import type { AuthContext } from "./authorization";
import { requireMatchingPlatformPaymentSecretBundle } from "./platform-payment-secret-bundle-revision";
import {
  toWechatQueriedRefundPayload,
  toWechatRequestedRefundPayload,
} from "./platform-billing-recharge-refund-wechat";
import {
  wechatPayGateway,
  type WechatPayRefundQueryResult,
  type WechatPayRequestRefundResult,
} from "./wechat-pay-gateway";
import {
  parseAndAssertWechatRefund,
  type WechatRefundApiPayload,
  type WechatRefundValidatedResult,
} from "./wechat-pay-refund-contract";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "./wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
} from "./wechat-pay-transaction-contract";
import { requireOrderPaymentConfig } from "./tenant-platform-service-order-payment-config";

type RepositoryPort = Pick<
  PlatformServiceFulfillmentRepository,
  "findPlatformServiceRefundRequestById" | "confirmServiceRefund"
>;
type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigById"
>;
type SecretBundleServicePort = Pick<typeof wechatPaySecretBundleService, "load">;
type WechatPayGatewayPort = Pick<
  typeof wechatPayGateway,
  "queryTransactionByOutTradeNo" | "requestRefund" | "queryRefundByOutRefundNo"
>;

export type PlatformServiceRefundExecutionDependencies = {
  repository?: RepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  nowFactory?: () => Date;
};

const REFUND_PERMISSION = "platform.service_refund.review";
const EXECUTABLE_STATUSES = new Set(["approved", "refunding", "refunded"]);

export class PlatformServiceRefundExecutionService {
  private readonly repository: RepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: PlatformServiceRefundExecutionDependencies = {}) {
    this.repository = dependencies.repository ?? platformServiceFulfillmentRepository;
    this.paymentConfigRepository = dependencies.paymentConfigRepository ??
      platformPaymentConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async execute(authContext: AuthContext, refundRequestId: string) {
    const operatorEmployeeId = this.assertCanExecute(authContext);
    const request = await this.repository.findPlatformServiceRefundRequestById(
      refundRequestId,
    );
    if (!request) {
      throw Errors.business(404, "平台技术服务退款申请不存在", "SERVICE_REFUND_REQUEST_NOT_FOUND");
    }
    this.assertExecutableState(request);
    const binding = this.buildBinding(request);
    if (request.status === "refunded") {
      return this.serializeResult(await this.repository.confirmServiceRefund({
        ...binding,
        outRefundNo: requireText(request.out_refund_no, "SERVICE_REFUND_EXECUTION_FACT_INVALID"),
        wechatRefundId: requireText(request.wechat_refund_id, "SERVICE_REFUND_EXECUTION_FACT_INVALID"),
        refundAmountFen: requirePositiveInteger(request.refund_amount_fen, "SERVICE_REFUND_EXECUTION_FACT_INVALID"),
        refundedAt: requireText(request.refunded_at, "SERVICE_REFUND_EXECUTION_FACT_INVALID"),
        operatorEmployeeId,
        metadata: { confirmation_source: "platform_service_refund_execution" },
      }));
    }

    const config = requireOrderPaymentConfig(
      await this.paymentConfigRepository.findWechatPayConfigById(
        binding.paymentConfigId,
      ),
      request.order,
    );
    const secretBundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.secretBundleService.load(config.encrypted_config_ref),
    );
    await this.assertOriginalTransaction(request, config, secretBundle);

    const outRefundNo = optionalText(request.out_refund_no) ??
      buildServiceRefundNo(request.id);
    const refund = await this.requestAndResolveRefund({
      request,
      config,
      secretBundle,
      outRefundNo,
    });
    if (refund.status !== "SUCCESS" || !refund.successTime) {
      throw uncertainStatusError(outRefundNo, refund.status);
    }
    const result = await this.repository.confirmServiceRefund({
      ...binding,
      outRefundNo: refund.outRefundNo,
      wechatRefundId: refund.wechatRefundId,
      refundAmountFen: refund.refundAmountFen,
      refundedAt: refund.successTime,
      operatorEmployeeId,
      metadata: {
        confirmation_source: "platform_service_refund_execution",
        wechat_request_id: refund.requestId,
      },
    });
    return this.serializeResult(result);
  }

  private assertCanExecute(authContext: AuthContext) {
    const platformIdentity = authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !platformIdentity || !authContext.employeeId) {
      throw Errors.forbidden();
    }
    if (!authContext.permissions.some((permission) =>
      permission.code === REFUND_PERMISSION
    )) throw Errors.forbidden();
    return authContext.employeeId;
  }

  private assertExecutableState(request: RefundExecutionRequestRecord) {
    if (!EXECUTABLE_STATUSES.has(request.status)) throw invalidStateError();
    const expectedPaymentStatuses = request.status === "refunded"
      ? ["refunded"]
      : ["refund_reviewing", "refunding"];
    if (!expectedPaymentStatuses.includes(request.order.payment_status)) {
      throw invalidStateError();
    }
  }

  private buildBinding(request: RefundExecutionRequestRecord) {
    const refundAmountFen = requirePositiveInteger(
      request.order.amount_fen,
      "SERVICE_REFUND_AMOUNT_INVALID",
    );
    const paidAmountFen = requirePositiveInteger(
      request.order.paid_amount_fen,
      "SERVICE_REFUND_AMOUNT_INVALID",
    );
    if (paidAmountFen !== refundAmountFen) {
      throw Errors.business(409, "平台技术服务订单仅支持原支付金额全额退款", "SERVICE_REFUND_AMOUNT_MISMATCH");
    }
    return {
      refundRequestId: request.id,
      serviceOrderId: request.order.id,
      transactionId: requireText(request.order.transaction_id, "SERVICE_REFUND_PAYMENT_BINDING_INVALID"),
      outTradeNo: requireText(request.order.out_trade_no, "SERVICE_REFUND_PAYMENT_BINDING_INVALID"),
      paymentConfigId: requireText(request.order.payment_config_id, "SERVICE_REFUND_PAYMENT_BINDING_INVALID"),
      paymentConfigGuardVersion: requirePositiveInteger(
        request.order.payment_config_guard_version,
        "SERVICE_REFUND_PAYMENT_BINDING_INVALID",
      ),
    };
  }

  private async assertOriginalTransaction(
    request: RefundExecutionRequestRecord,
    config: PlatformPaymentConfigRecord,
    secretBundle: WechatPaySecretBundle,
  ) {
    const response = await this.wechatPayGateway.queryTransactionByOutTradeNo({
      config,
      secretBundle,
      outTradeNo: request.order.out_trade_no,
    });
    const transaction = parseAndAssertWechatPayTransactionQuery(
      response,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: config.merchant_mode,
        merchantId: config.merchant_id,
        subMerchantId: config.sub_merchant_id,
        outTradeNo: request.order.out_trade_no,
        amountFen: request.order.amount_fen,
        transactionId: request.order.transaction_id,
      }),
    );
    assertWechatPaySuccessTransaction(transaction);
  }

  private async requestAndResolveRefund(input: {
    request: RefundExecutionRequestRecord;
    config: PlatformPaymentConfigRecord;
    secretBundle: WechatPaySecretBundle;
    outRefundNo: string;
  }) {
    let payload: WechatRefundApiPayload;
    try {
      const requested = await this.wechatPayGateway.requestRefund({
        config: input.config,
        secretBundle: input.secretBundle,
        transactionId: input.request.order.transaction_id,
        outRefundNo: input.outRefundNo,
        reason: input.request.reason,
        refundAmountFen: input.request.order.amount_fen,
        totalAmountFen: input.request.order.paid_amount_fen,
      });
      payload = toWechatRequestedRefundPayload(
        requested as WechatPayRequestRefundResult,
      );
    } catch {
      return this.queryRefund(input);
    }
    const refund = this.parseRefund(payload, input.request, input.outRefundNo);
    if (refund.status === "PROCESSING") return this.queryRefund(input);
    if (refund.status !== "SUCCESS") throw terminalStatusError(refund.status);
    return refund;
  }

  private async queryRefund(input: {
    request: RefundExecutionRequestRecord;
    config: PlatformPaymentConfigRecord;
    secretBundle: WechatPaySecretBundle;
    outRefundNo: string;
  }) {
    let queried: WechatPayRefundQueryResult;
    try {
      queried = await this.wechatPayGateway.queryRefundByOutRefundNo({
        config: input.config,
        secretBundle: input.secretBundle,
        outRefundNo: input.outRefundNo,
      });
    } catch {
      throw uncertainStatusError(input.outRefundNo, null);
    }
    const refund = this.parseRefund(
      toWechatQueriedRefundPayload(queried),
      input.request,
      input.outRefundNo,
    );
    if (refund.status === "PROCESSING") {
      throw uncertainStatusError(input.outRefundNo, refund.status);
    }
    if (refund.status !== "SUCCESS") throw terminalStatusError(refund.status);
    return refund;
  }

  private parseRefund(
    payload: WechatRefundApiPayload,
    request: RefundExecutionRequestRecord,
    outRefundNo: string,
  ): WechatRefundValidatedResult {
    return parseAndAssertWechatRefund(payload, {
      outRefundNo,
      wechatRefundId: optionalText(request.wechat_refund_id),
      transactionId: request.order.transaction_id,
      outTradeNo: request.order.out_trade_no,
      refundAmountFen: request.order.amount_fen,
      totalAmountFen: request.order.paid_amount_fen,
      currency: "CNY",
    });
  }

  private serializeResult(result: Awaited<ReturnType<RepositoryPort["confirmServiceRefund"]>>) {
    return {
      refund_request: result.refundRequest,
      order: result.order,
      contract: result.contract,
      contract_period: result.contractPeriod,
      idempotent: result.idempotent,
      error_code: result.errorCode,
      server_time: this.nowFactory().toISOString(),
    };
  }
}

function buildServiceRefundNo(refundRequestId: string) {
  return `TSRF${refundRequestId.replaceAll("-", "").toUpperCase()}`;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireText(value: unknown, code: string) {
  const text = optionalText(value);
  if (!text) throw Errors.business(409, "平台技术服务退款支付绑定不完整", code);
  return text;
}

function requirePositiveInteger(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw Errors.business(409, "平台技术服务退款金额不正确", code);
  }
  return value;
}

function invalidStateError() {
  return Errors.business(409, "平台技术服务退款申请状态已变化", "SERVICE_REFUND_INVALID_STATE");
}

function terminalStatusError(status: "CLOSED" | "ABNORMAL") {
  return Errors.business(
    409,
    status === "CLOSED" ? "微信退款已关闭，请核查后重新处理" : "微信退款状态异常，请人工核查",
    `SERVICE_REFUND_WECHAT_${status}`,
    { status },
  );
}

function uncertainStatusError(outRefundNo: string, status: string | null) {
  return Errors.business(
    502,
    "微信退款结果暂无法确认，请稍后按原退款单号重试",
    "SERVICE_REFUND_STATUS_UNKNOWN",
    { out_refund_no: outRefundNo, status },
  );
}

export const platformServiceRefundExecutionService =
  new PlatformServiceRefundExecutionService();
