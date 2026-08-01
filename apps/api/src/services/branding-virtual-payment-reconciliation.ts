import {
  brandingVirtualOrderRepository,
} from "@/repositories/branding-virtual-orders";
import type {
  BrandingVirtualOfficialStatus,
  BrandingVirtualPaymentReconciliationClaim,
} from "@/repositories/branding-virtual-payment-reconciliation";
import {
  brandingVirtualPaymentConfirmation,
  type BrandingVirtualSuccessfulTransaction,
} from "@/services/branding-virtual-payment-confirmation";
import {
  assertQueryBinding,
  clampBatchSize,
  confirmationOrder,
  persistedTransaction,
  preparedTransaction,
  queriedTransaction,
  requestIdFrom,
  requireAttemptKey,
  requirePreparedStatus,
  requireText,
  retryAt,
  safeErrorCode,
  throwGrantPending,
  throwSecretInvalid,
} from "@/services/branding-virtual-payment-reconciliation-helpers";
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";
import { wechatMiniSessionCredentialService } from "@/services/wechat-mini-session-credentials";
import { WechatVirtualPaymentGateway } from "@/services/wechat-virtual-payment-gateway";
import type { WechatVirtualPaymentGatewayPort } from "@/services/wechat-virtual-payment-gateway-contracts";

const CLAIM_LEASE_SECONDS = 120;

type RepositoryPort = Pick<
  typeof brandingVirtualOrderRepository,
  | "claimReconciliationBatch"
  | "rescheduleReconciliation"
  | "closeUnpaidReconciliation"
  | "prepareSuccessfulQueryReconciliation"
  | "finalizeReconciliationAfterConfirmation"
  | "markReconciliationDelivery"
  | "beginReconciliationDeliveryRetry"
>;
type ConfirmationPort = Pick<
  typeof brandingVirtualPaymentConfirmation,
  "confirm"
>;
type GatewayPort = Pick<
  WechatVirtualPaymentGatewayPort,
  "queryOrder" | "notifyProvideGoods"
>;
type SettingsPort = Pick<typeof systemSettingsService, "getPlatformSecretString">;

export type BrandingVirtualReconciliationTelemetry = {
  claimed: number;
  queried: number;
  confirmed: number;
  closed: number;
  failed: number;
  grantRecovered: number;
};

type Dependencies = {
  repository?: RepositoryPort;
  gateway?: GatewayPort;
  confirmation?: ConfirmationPort;
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  settingsService?: SettingsPort;
  nowFactory?: () => Date;
  attemptKeyFactory?: () => string;
};

type BatchResources = {
  accessToken: () => Promise<string>;
  signingSecret: (
    claim: BrandingVirtualPaymentReconciliationClaim,
  ) => Promise<{ environment: "sandbox" | "production"; appKey: string }>;
};

type ProcessContext = {
  officialStatus: BrandingVirtualOfficialStatus | null;
};

export class BrandingVirtualPaymentReconciliationService {
  private readonly repository: RepositoryPort;
  private readonly gateway: GatewayPort;
  private readonly confirmation: ConfirmationPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;
  private readonly settingsService: SettingsPort;
  private readonly nowFactory: () => Date;
  private readonly attemptKeyFactory: () => string;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? brandingVirtualOrderRepository;
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.confirmation = dependencies.confirmation ??
      brandingVirtualPaymentConfirmation;
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.attemptKeyFactory = dependencies.attemptKeyFactory ?? crypto.randomUUID;
  }

  async reconcile(input: {
    batchSize: number;
  }): Promise<BrandingVirtualReconciliationTelemetry> {
    const claims = await this.repository.claimReconciliationBatch({
      limit: clampBatchSize(input.batchSize),
      leaseSeconds: CLAIM_LEASE_SECONDS,
    });
    const telemetry = createTelemetry(claims.length);
    const resources = this.createBatchResources();

    for (const claim of claims) {
      const context: ProcessContext = { officialStatus: null };
      try {
        await this.processClaim(claim, telemetry, resources, context);
      } catch (error) {
        telemetry.failed += 1;
        await this.rescheduleBestEffort(claim, context.officialStatus, error);
      }
    }
    return telemetry;
  }

  private async processClaim(
    claim: BrandingVirtualPaymentReconciliationClaim,
    telemetry: BrandingVirtualReconciliationTelemetry,
    resources: BatchResources,
    context: ProcessContext,
  ): Promise<void> {
    if (claim.provider_delivery_status === "pending") {
      await this.deliver(claim, requireAttemptKey(claim), telemetry, resources);
      return;
    }
    if (claim.provider_delivery_status === "failed") {
      const attemptKey = this.attemptKeyFactory();
      await this.repository.beginReconciliationDeliveryRetry({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        attemptKey,
      });
      await this.deliver(claim, attemptKey, telemetry, resources);
      return;
    }
    if (claim.reconcile_completion_kind === "query") {
      const status = requirePreparedStatus(claim);
      context.officialStatus = status;
      await this.confirmAndFinalizeQuery(
        claim,
        preparedTransaction(claim),
        status,
        telemetry,
        resources,
      );
      return;
    }
    if (
      claim.reconcile_completion_kind === "grant_recovery" ||
      claim.fulfillment_status === "grant_failed"
    ) {
      await this.confirmGrantRecovery(claim, telemetry);
      return;
    }

    const result = await this.gateway.queryOrder({
      accessToken: await resources.accessToken(),
      openid: claim.payer_openid,
      environment: claim.environment,
      signingSecret: await resources.signingSecret(claim),
      orderId: claim.out_trade_no,
    });
    telemetry.queried += 1;
    context.officialStatus = result.status;
    assertQueryBinding(claim, result);
    if (result.status === 0 || result.status === 1 || result.status === 6) {
      await this.repository.closeUnpaidReconciliation({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        officialStatus: result.status,
      });
      telemetry.closed += 1;
      return;
    }
    if (result.status === 2 || result.status === 3 || result.status === 4) {
      const transaction = queriedTransaction(claim, result);
      await this.repository.prepareSuccessfulQueryReconciliation({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        officialStatus: result.status,
        ...transaction,
      });
      await this.confirmAndFinalizeQuery(
        claim,
        transaction,
        result.status,
        telemetry,
        resources,
      );
      return;
    }
    await this.repository.rescheduleReconciliation({
      orderId: claim.id,
      claimToken: claim.reconcile_claim_token,
      nextAt: retryAt(this.nowFactory(), claim.reconcile_attempt_count),
      officialStatus: result.status,
      errorCode: `WECHAT_VIRTUAL_PAYMENT_STATUS_${result.status}`,
      errorSummary: "微信虚拟支付订单状态需继续核查",
    });
    telemetry.failed += 1;
  }

  private async confirmAndFinalizeQuery(
    claim: BrandingVirtualPaymentReconciliationClaim,
    transaction: BrandingVirtualSuccessfulTransaction,
    status: 2 | 3 | 4,
    telemetry: BrandingVirtualReconciliationTelemetry,
    resources: BatchResources,
  ): Promise<void> {
    const result = await this.confirmation.confirm({
      source: "reconciliation",
      order: confirmationOrder(claim),
      transaction,
      notificationId: null,
      allowLateClosedRecovery: true,
    });
    if (!result.fulfilled) throwGrantPending(result.failure_code);
    telemetry.confirmed += 1;
    const attemptKey = status === 2 ? this.attemptKeyFactory() : null;
    await this.repository.finalizeReconciliationAfterConfirmation({
      orderId: claim.id,
      claimToken: claim.reconcile_claim_token,
      officialStatus: status,
      providerOrderNo: transaction.providerOrderNo,
      transactionId: transaction.transactionId,
      paidAmountFen: transaction.actualPriceFen,
      paidAt: transaction.paidAt,
      deliveryAttemptKey: attemptKey,
    });
    if (attemptKey) {
      await this.deliver(
        { ...claim, provider_order_no: transaction.providerOrderNo },
        attemptKey,
        telemetry,
        resources,
      );
    }
  }

  private async confirmGrantRecovery(
    claim: BrandingVirtualPaymentReconciliationClaim,
    telemetry: BrandingVirtualReconciliationTelemetry,
  ): Promise<void> {
    const result = await this.confirmation.confirm({
      source: "reconciliation",
      order: confirmationOrder(claim),
      transaction: persistedTransaction(claim),
      notificationId: null,
      allowLateClosedRecovery: true,
    });
    if (!result.fulfilled) throwGrantPending(result.failure_code);
    telemetry.confirmed += 1;
    telemetry.grantRecovered += 1;
    await this.repository.finalizeReconciliationAfterConfirmation({
      orderId: claim.id,
      claimToken: claim.reconcile_claim_token,
      officialStatus: null,
      providerOrderNo: null,
      transactionId: null,
      paidAmountFen: null,
      paidAt: null,
      deliveryAttemptKey: null,
    });
  }

  private async deliver(
    claim: BrandingVirtualPaymentReconciliationClaim,
    attemptKey: string,
    telemetry: BrandingVirtualReconciliationTelemetry,
    resources: BatchResources,
  ): Promise<void> {
    try {
      const result = await this.gateway.notifyProvideGoods({
        accessToken: await resources.accessToken(),
        environment: claim.environment,
        wechatOrderId: requireText(claim.provider_order_no),
      });
      await this.repository.markReconciliationDelivery({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        status: "succeeded",
        attemptKey,
        providerRequestId: result.requestId,
        errorCode: null,
        errorSummary: null,
      });
    } catch (error) {
      await this.repository.markReconciliationDelivery({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        status: "failed",
        attemptKey,
        providerRequestId: requestIdFrom(error),
        errorCode: safeErrorCode(error),
        errorSummary: "微信虚拟支付发货通知暂时失败",
      });
      telemetry.failed += 1;
    }
  }

  private createBatchResources(): BatchResources {
    let tokenPromise: Promise<string> | null = null;
    const secrets = new Map<
      "sandbox" | "production",
      Promise<{ appKey: string; revision: number }>
    >();
    return {
      accessToken: () => {
        tokenPromise ??= this.accessTokenProvider.getAccessToken();
        return tokenPromise;
      },
      signingSecret: async (claim) => {
        let promise = secrets.get(claim.environment);
        if (!promise) {
          const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[claim.environment];
          promise = this.settingsService.getPlatformSecretString(key)
            .then((value) => {
              const parsed = parseWechatVirtualPaymentSecretBundle(value);
              if (!parsed) throwSecretInvalid();
              return parsed;
            });
          secrets.set(claim.environment, promise);
        }
        const secret = await promise;
        if (secret.revision !== claim.secret_revision) throwSecretInvalid();
        return { environment: claim.environment, appKey: secret.appKey };
      },
    };
  }

  private async rescheduleBestEffort(
    claim: BrandingVirtualPaymentReconciliationClaim,
    officialStatus: BrandingVirtualOfficialStatus | null,
    error: unknown,
  ): Promise<void> {
    try {
      await this.repository.rescheduleReconciliation({
        orderId: claim.id,
        claimToken: claim.reconcile_claim_token,
        nextAt: retryAt(this.nowFactory(), claim.reconcile_attempt_count),
        officialStatus,
        errorCode: safeErrorCode(error),
        errorSummary: "虚拟支付补偿暂时失败",
      });
    } catch {
      // Lease expiry makes the row claimable after a persistence failure.
    }
  }
}

function createTelemetry(claimed: number): BrandingVirtualReconciliationTelemetry {
  return { claimed, queried: 0, confirmed: 0, closed: 0, failed: 0,
    grantRecovered: 0 };
}

export const brandingVirtualPaymentReconciliationService =
  new BrandingVirtualPaymentReconciliationService();
