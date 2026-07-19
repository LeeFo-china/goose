import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRefundReconciliationRepository,
  type ClaimedRefund,
} from "@/repositories/billing-recharge-refund-reconciliation";
import {
  getWechatErrorDetailCode,
  toWechatQueriedRefundPayload,
  toWechatRequestedRefundPayload,
} from "@/services/platform-billing-recharge-refund-wechat";
import { wechatPayGateway } from "@/services/wechat-pay-gateway";
import { parseAndAssertWechatRefund } from "@/services/wechat-pay-refund-contract";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";

const MINUTE_MS = 60_000;
const RECONCILE_LEASE_SECONDS = 120;

export type RefundReconciliationRepositoryPort = Pick<
  typeof billingRechargeRefundReconciliationRepository,
  "claimDue" | "reschedule" | "close" | "confirmSuccess"
>;

type Dependencies = {
  repository?: RefundReconciliationRepositoryPort;
  secretBundleService?: Pick<typeof wechatPaySecretBundleService, "load">;
  wechatPayGateway?: Pick<
    typeof wechatPayGateway,
    "queryRefundByOutRefundNo" | "requestRefund"
  >;
  nowFactory?: () => Date;
  claimTokenFactory?: () => string;
};

export type RefundReconciliationSummary = {
  claimed: number;
  success: number;
  processing: number;
  closed: number;
  abnormal: number;
  rescheduled: number;
  failed: number;
};

export function refundReconcileDelayMs(attemptCount: number): number {
  if (attemptCount <= 5) return MINUTE_MS;
  if (attemptCount === 6) return 5 * MINUTE_MS;
  if (attemptCount === 7) return 10 * MINUTE_MS;
  if (attemptCount === 8) return 20 * MINUTE_MS;
  return 30 * MINUTE_MS;
}

export class BillingRechargeRefundReconciliationService {
  private readonly repository: RefundReconciliationRepositoryPort;
  private readonly secretBundleService: Pick<
    typeof wechatPaySecretBundleService,
    "load"
  >;
  private readonly wechatPayGateway: Pick<
    typeof wechatPayGateway,
    "queryRefundByOutRefundNo" | "requestRefund"
  >;
  private readonly nowFactory: () => Date;
  private readonly claimTokenFactory: () => string;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ??
      billingRechargeRefundReconciliationRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.claimTokenFactory = dependencies.claimTokenFactory ??
      (() => crypto.randomUUID());
  }

  async runBatch(input: { limit: number }): Promise<RefundReconciliationSummary> {
    assertLimit(input.limit);
    const now = this.nowFactory();
    const claimToken = this.claimTokenFactory();
    const claims = await this.repository.claimDue({
      limit: input.limit,
      leaseSeconds: RECONCILE_LEASE_SECONDS,
      claimToken,
      now: now.toISOString(),
    });
    const summary = createSummary(claims.length);

    for (const claim of claims) {
      try {
        await this.processClaim(claim, claimToken, now, summary);
      } catch (error) {
        summary.failed += 1;
        await this.rescheduleFailedClaim(
          claim,
          claimToken,
          now,
          error,
          summary,
        );
      }
    }
    return summary;
  }

  private async rescheduleFailedClaim(
    claim: ClaimedRefund,
    claimToken: string,
    now: Date,
    error: unknown,
    summary: RefundReconciliationSummary,
  ): Promise<void> {
    try {
      const rescheduled = await this.repository.reschedule({
        refundRequestId: claim.id,
        claimToken,
        reconcileNextAt: addMs(
          now,
          refundReconcileDelayMs(claim.reconcile_attempt_count),
        ),
        checkedAt: now.toISOString(),
        lastError: stableErrorCode(error),
        metadata: createMetadata(
          now,
          null,
          errorRequestId(error),
        ),
        wechatRefundId: claim.wechat_refund_id,
        refundAmountFen: claim.refund_amount_fen,
      });
      if (rescheduled) summary.rescheduled += 1;
    } catch {
      // The lease expiry makes the row recoverable; the batch failure count
      // already records this row and processing must continue with later rows.
      return;
    }
  }

  private async processClaim(
    claim: ClaimedRefund,
    claimToken: string,
    now: Date,
    summary: RefundReconciliationSummary,
  ): Promise<void> {
    const order = requireClaimOrder(claim);
    const config = requireClaimConfig(claim);
    const outRefundNo = requireString(claim.out_refund_no, "退款单号缺失");
    const transactionId = requireString(order.transaction_id, "微信交易号缺失");
    const outTradeNo = requireString(order.out_trade_no, "商户支付单号缺失");
    const totalAmountFen = requirePositiveAmount(
      order.paid_amount_fen || order.amount_fen,
      "支付金额不正确",
    );
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    let payload;
    try {
      const queried = await this.wechatPayGateway.queryRefundByOutRefundNo({
        config,
        outRefundNo,
        secretBundle,
      });
      payload = toWechatQueriedRefundPayload(queried);
    } catch (error) {
      if (getWechatErrorDetailCode(error) !== "RESOURCE_NOT_EXISTS") {
        throw error;
      }
      const requested = await this.wechatPayGateway.requestRefund({
        config,
        secretBundle,
        transactionId,
        outRefundNo,
        reason: claim.reason,
        refundAmountFen: claim.requested_amount_fen,
        totalAmountFen,
      });
      payload = toWechatRequestedRefundPayload(requested);
    }
    const refund = parseAndAssertWechatRefund(
      payload,
      {
        outRefundNo,
        wechatRefundId: claim.wechat_refund_id,
        transactionId,
        outTradeNo,
        refundAmountFen: claim.requested_amount_fen,
        totalAmountFen,
        currency: "CNY",
      },
    );

    const metadata = createMetadata(now, refund.status, refund.requestId);
    if (refund.status === "SUCCESS") {
      await this.repository.confirmSuccess({
        refundRequestId: claim.id,
        claimToken,
        outRefundNo: refund.outRefundNo,
        wechatRefundId: refund.wechatRefundId,
        refundAmountFen: refund.refundAmountFen,
        refundedAt: refund.successTime,
        metadata,
      });
      summary.success += 1;
      return;
    }

    if (refund.status === "CLOSED") {
      await this.repository.close({
        refundRequestId: claim.id,
        claimToken,
        checkedAt: now.toISOString(),
        metadata,
      });
      summary.closed += 1;
      return;
    }

    if (refund.status === "ABNORMAL") {
      summary.abnormal += 1;
      const rescheduled = await this.repository.reschedule({
        refundRequestId: claim.id,
        claimToken,
        reconcileNextAt: addMs(now, 30 * MINUTE_MS),
        checkedAt: now.toISOString(),
        lastError: "WECHAT_REFUND_ABNORMAL",
        metadata,
        wechatRefundId: refund.wechatRefundId,
        refundAmountFen: refund.refundAmountFen,
      });
      if (rescheduled) summary.rescheduled += 1;
      return;
    }

    if (refund.status !== "PROCESSING") {
      throw Errors.business(
        502,
        "微信退款对账状态暂不支持",
        "BILLING_RECHARGE_REFUND_RECONCILE_STATUS_UNSUPPORTED",
      );
    }
    summary.processing += 1;
    const rescheduled = await this.repository.reschedule({
      refundRequestId: claim.id,
      claimToken,
      reconcileNextAt: addMs(
        now,
        refundReconcileDelayMs(claim.reconcile_attempt_count),
      ),
      checkedAt: now.toISOString(),
      lastError: null,
      metadata,
      wechatRefundId: refund.wechatRefundId,
      refundAmountFen: refund.refundAmountFen,
    });
    if (rescheduled) summary.rescheduled += 1;
  }
}

function createSummary(claimed: number): RefundReconciliationSummary {
  return {
    claimed,
    success: 0,
    processing: 0,
    closed: 0,
    abnormal: 0,
    rescheduled: 0,
    failed: 0,
  };
}

function createMetadata(
  now: Date,
  status: string | null,
  requestId: string | null,
) {
  return {
    reconcile_source: "billing_reconcile_worker",
    reconcile_checked_at: now.toISOString(),
    wechat_refund_status: status,
    wechat_request_id: requestId,
  };
}

function stableErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return "BILLING_RECHARGE_REFUND_RECONCILE_FAILED";
}

function errorRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("details" in error)) {
    return null;
  }
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const requestId = (details as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId.trim()
    ? requestId.trim()
    : null;
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw Errors.business(
      400,
      "微信退款对账批次大小必须在 1 到 100 之间",
      "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
    );
  }
}

function requireClaimOrder(claim: ClaimedRefund) {
  if (claim.order) return claim.order;
  throw Errors.business(
    409,
    "微信退款对账关联订单不存在",
    "BILLING_RECHARGE_REFUND_RECONCILE_ORDER_NOT_FOUND",
  );
}

function requireClaimConfig(claim: ClaimedRefund) {
  if (claim.config) return claim.config;
  throw Errors.business(
    409,
    "微信退款对账原支付配置不存在",
    "BILLING_RECHARGE_REFUND_RECONCILE_CONFIG_NOT_FOUND",
  );
}

function requireString(value: unknown, message: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw Errors.business(
    409,
    message,
    "BILLING_RECHARGE_REFUND_RECONCILE_DATA_INVALID",
  );
}

function requirePositiveAmount(value: number, message: string): number {
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw Errors.business(
    409,
    message,
    "BILLING_RECHARGE_REFUND_RECONCILE_DATA_INVALID",
  );
}

function addMs(date: Date, delayMs: number): string {
  return new Date(date.getTime() + delayMs).toISOString();
}

export const billingRechargeRefundReconciliationService =
  new BillingRechargeRefundReconciliationService();
