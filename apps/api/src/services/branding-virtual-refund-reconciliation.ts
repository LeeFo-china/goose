import {
  brandingVirtualRefundReconciliationRepository,
  type BrandingVirtualRefundReconciliationClaim,
} from "@/repositories/branding-virtual-refund-reconciliation";
import { Errors } from "@/errors/error-factory";
import { brandingVirtualRefundRepository } from "@/repositories/branding-virtual-refunds";
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { systemSettingsService } from "@/services/system-settings";
import { wechatMiniProgramAccessTokenProvider } from "@/services/wechat-miniprogram-access-token";
import { WechatVirtualPaymentGateway } from "@/services/wechat-virtual-payment-gateway";
import { wechatMiniSessionCredentialService } from "@/services/wechat-mini-session-credentials";

type Repository = typeof brandingVirtualRefundReconciliationRepository;
type Gateway = Pick<WechatVirtualPaymentGateway, "queryOrder">;

export type BrandingVirtualRefundReconciliationTelemetry = {
  refundClaimed: number; refundQueried: number; refundSucceeded: number;
  refundFailed: number; refundCompensated: number; refundPending: number;
  refundRescheduled: number; refundTerminalFailed: number;
};

export class BrandingVirtualRefundReconciliationService {
  constructor(private readonly dependencies: {
    repository?: Repository; refunds?: Pick<typeof brandingVirtualRefundRepository, "compensate">;
    gateway?: Gateway; accessToken?: { getAccessToken(): Promise<string> };
    settings?: Pick<typeof systemSettingsService, "getPlatformSecretString">;
    now?: () => Date;
  } = {}) {}

  async reconcile(input: { batchSize: number }): Promise<BrandingVirtualRefundReconciliationTelemetry> {
    const repository = this.dependencies.repository ?? brandingVirtualRefundReconciliationRepository;
    const claims = await repository.claim({ limit: input.batchSize, leaseSeconds: 120 });
    const telemetry = { refundClaimed: claims.length, refundQueried: 0,
      refundSucceeded: 0, refundFailed: 0, refundCompensated: 0,
      refundPending: 0, refundRescheduled: 0, refundTerminalFailed: 0 };
    const resources = this.createResources();
    await runBounded(claims, 20, async (claim) => {
      try {
        await this.process(claim, telemetry, resources);
      } catch (error) {
        telemetry.refundFailed += 1;
        await this.reschedule(claim, error);
      }
    });
    return telemetry;
  }

  private async process(
    claim: BrandingVirtualRefundReconciliationClaim,
    telemetry: BrandingVirtualRefundReconciliationTelemetry,
    resources: ReturnType<BrandingVirtualRefundReconciliationService["createResources"]>,
  ): Promise<void> {
    if (claim.refund_status === "succeeded") {
      this.assertLease(claim);
      const refunds = this.dependencies.refunds ?? brandingVirtualRefundRepository;
      await refunds.compensate({ refundId: claim.refund_id });
      telemetry.refundCompensated += 1;
      return;
    }
    const [accessToken, secret] = await Promise.all([
      resources.accessToken(), resources.secret(claim.environment),
    ]);
    if (secret.revision !== claim.secret_revision) {
      throw Errors.business(409, "虚拟支付密钥版本不一致",
        "BRANDING_VIRTUAL_PAYMENT_SECRET_REVISION_INVALID");
    }
    const gateway = this.dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.assertLease(claim);
    const result = await gateway.queryOrder({
      accessToken, openid: claim.payer_openid, environment: claim.environment,
      signingSecret: { environment: claim.environment, appKey: secret.appKey },
      orderId: claim.out_trade_no,
    });
    telemetry.refundQueried += 1;
    const expectedOrderType = claim.platform_mode === "merchant_initiated" ? 0 : 7;
    if (result.orderId !== claim.out_trade_no || result.environment !== claim.environment
      || result.orderFee !== claim.amount_fen || result.paidFee !== claim.amount_fen
      || result.orderType !== expectedOrderType) {
      throw Errors.business(409, "虚拟支付退款查询事实不一致",
        "BRANDING_VIRTUAL_REFUND_RECONCILIATION_FACT_CONFLICT");
    }
    const terminal = claim.platform_mode === "merchant_initiated"
      ? result.status === 5 : result.status === 8;
    if (terminal || result.status === 7) {
      this.assertLease(claim);
      await (this.dependencies.repository ?? brandingVirtualRefundReconciliationRepository)
        .finalize({
          refundId: claim.refund_id, claimToken: claim.claim_token,
          officialStatus: result.status as 5 | 7 | 8,
          refundFeeFen: result.refundFee, leftFeeFen: result.leftFee,
        });
      if (terminal) {
        telemetry.refundSucceeded += 1;
        this.assertLease(claim);
        const refunds = this.dependencies.refunds ?? brandingVirtualRefundRepository;
        await refunds.compensate({ refundId: claim.refund_id });
        telemetry.refundCompensated += 1;
      } else {
        telemetry.refundTerminalFailed += 1;
      }
      return;
    }
    telemetry.refundPending += 1;
    await this.reschedulePending(claim);
    telemetry.refundRescheduled += 1;
  }

  private createResources() {
    let token: Promise<string> | null = null;
    const secrets = new Map<"sandbox" | "production", Promise<{
      revision: number; appKey: string;
    }>>();
    return {
      accessToken: () => {
        token ??= (this.dependencies.accessToken ??
          wechatMiniProgramAccessTokenProvider).getAccessToken();
        return token;
      },
      secret: (environment: "sandbox" | "production") => {
        let value = secrets.get(environment);
        if (!value) {
          value = (this.dependencies.settings ?? systemSettingsService)
            .getPlatformSecretString(WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment])
            .then((raw) => {
              const parsed = parseWechatVirtualPaymentSecretBundle(raw);
              if (!parsed) throw Errors.business(409, "虚拟支付密钥无效",
                "BRANDING_VIRTUAL_PAYMENT_SECRET_REVISION_INVALID");
              return parsed;
            });
          secrets.set(environment, value);
        }
        return value;
      },
    };
  }

  private assertLease(claim: BrandingVirtualRefundReconciliationClaim): void {
    const now = this.dependencies.now?.() ?? new Date();
    if (new Date(claim.claim_expires_at).getTime() - now.getTime() < 30_000) {
      throw Errors.business(409, "虚拟支付退款对账租约余量不足",
        "BRANDING_VIRTUAL_REFUND_RECONCILIATION_CLAIM_EXPIRED");
    }
  }

  private async reschedule(claim: BrandingVirtualRefundReconciliationClaim, error: unknown) {
    try {
      const code = typeof error === "object" && error &&
        typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code : "INTERNAL_SERVER_ERROR";
      await (this.dependencies.repository ?? brandingVirtualRefundReconciliationRepository)
        .reschedule({ refundId: claim.refund_id, claimToken: claim.claim_token,
          nextAt: this.nextAt(claim).toISOString(), errorCode: code,
          errorSummary: "虚拟支付退款对账等待重试" });
    } catch {
      // The bounded lease makes a failed reschedule recoverable.
    }
  }

  private async reschedulePending(claim: BrandingVirtualRefundReconciliationClaim) {
    const repository = this.dependencies.repository ??
      brandingVirtualRefundReconciliationRepository;
    await repository.reschedule({
      refundId: claim.refund_id, claimToken: claim.claim_token,
      nextAt: this.nextAt(claim).toISOString(),
      errorCode: "WECHAT_VIRTUAL_REFUND_PENDING",
      errorSummary: "微信虚拟支付退款仍在处理中",
    });
  }

  private nextAt(claim: BrandingVirtualRefundReconciliationClaim): Date {
    return new Date((this.dependencies.now?.() ?? new Date()).getTime() +
      Math.min(3_600_000, 30_000 * 2 ** Math.min(claim.attempt_count, 6)));
  }
}

export const brandingVirtualRefundReconciliationService =
  new BrandingVirtualRefundReconciliationService();

async function runBounded<T>(
  items: readonly T[], concurrency: number, work: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const item = items[index++];
        if (item !== undefined) await work(item);
      }
    }));
}
