import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import {
  billingRechargePaymentConfirmation,
  type BillingRechargePaymentConfirmationInput,
} from "@/services/billing-recharge-payment-confirmation";
import {
  wechatPayGateway,
  type WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

type RepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "claimExpiredOrders"
  | "renewCloseClaim"
  | "markOrderClosed"
  | "releaseCloseClaim"
>;
type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigById"
>;
type SecretBundleServicePort = Pick<typeof wechatPaySecretBundleService, "load">;
type WechatPayGatewayPort = Pick<
  typeof wechatPayGateway,
  "queryTransactionByOutTradeNo" | "closeTransactionByOutTradeNo"
>;
type PaymentConfirmationPort = {
  confirm: (input: BillingRechargePaymentConfirmationInput) => Promise<unknown>;
};

export type BillingRechargeExpirationTelemetry = {
  claimed: number;
  paid: number;
  closed: number;
  retried: number;
  failed: number;
  release_failed: number;
};

export type BillingRechargeExpirationServiceDependencies = {
  repository?: RepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  paymentConfirmation?: PaymentConfirmationPort;
  nowFactory?: () => Date;
  leaseSeconds?: number;
};

type BatchContext = {
  config: PlatformPaymentConfigRecord;
  secretBundle: WechatPaySecretBundle;
};

type DeferredRelease = {
  orderId: string;
  claimToken: string;
  diagnostic: string | null;
};

type OrderOutcome = "paid" | "closed" | "retried" | "failed";

const DEFAULT_LEASE_SECONDS = 60;
const DIAGNOSTIC = {
  paymentConfigRequired: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_REQUIRED",
  paymentConfigFailed: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_FAILED",
  outTradeNoRequired: "BILLING_RECHARGE_EXPIRE_OUT_TRADE_NO_REQUIRED",
  claimRenewFailed: "BILLING_RECHARGE_EXPIRE_CLAIM_RENEW_FAILED",
  queryFailed: "BILLING_RECHARGE_EXPIRE_QUERY_FAILED",
  tradeStateRetry: "BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
  confirmFailed: "BILLING_RECHARGE_EXPIRE_CONFIRM_FAILED",
  markClosedFailed: "BILLING_RECHARGE_EXPIRE_MARK_CLOSED_FAILED",
  closeUncertain: "BILLING_RECHARGE_EXPIRE_CLOSE_UNCERTAIN",
  secondQueryFailed: "BILLING_RECHARGE_EXPIRE_SECOND_QUERY_FAILED",
} as const;

export class BillingRechargeExpirationService {
  private readonly repository: RepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly paymentConfirmation: PaymentConfirmationPort;
  private readonly nowFactory: () => Date;
  private readonly leaseSeconds: number;

  constructor(dependencies: BillingRechargeExpirationServiceDependencies = {}) {
    this.repository = dependencies.repository ?? billingRechargeRepository;
    this.paymentConfigRepository = dependencies.paymentConfigRepository ??
      platformPaymentConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.paymentConfirmation = dependencies.paymentConfirmation ??
      billingRechargePaymentConfirmation;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.leaseSeconds = clampInteger(
      dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
      10,
      600,
    );
  }

  async runExpiredOrderChecks(
    input: { batchSize: number },
  ): Promise<BillingRechargeExpirationTelemetry> {
    const limit = clampInteger(input.batchSize, 1, 100);
    const telemetry = emptyTelemetry();
    const deferred: DeferredRelease[] = [];
    const contextCache = new Map<string, Promise<BatchContext>>();
    const seenOrderIds: string[] = [];

    try {
      for (let index = 0; index < limit; index += 1) {
        const orders = await this.repository.claimExpiredOrders({
          now: this.nowFactory(),
          batchSize: 1,
          leaseSeconds: this.leaseSeconds,
          excludedOrderIds: [...seenOrderIds],
        });
        const order = orders[0];
        if (!order) break;

        seenOrderIds.push(order.id);
        telemetry.claimed += 1;
        await this.processClaimedOrder({
          order,
          contextCache,
          deferred,
          telemetry,
        });
      }
    } finally {
      await this.releaseDeferredClaims(deferred, telemetry);
    }
    return telemetry;
  }

  private async processClaimedOrder(input: {
    order: TenantCreditOrderRecord;
    contextCache: Map<string, Promise<BatchContext>>;
    deferred: DeferredRelease[];
    telemetry: BillingRechargeExpirationTelemetry;
  }): Promise<void> {
    const claimToken = optionalString(input.order.close_claim_token);
    if (!claimToken) {
      input.telemetry.failed += 1;
      return;
    }

    const configId = optionalString(input.order.payment_config_id);
    if (!configId) {
      this.deferFailure(input, claimToken, DIAGNOSTIC.paymentConfigRequired);
      return;
    }
    const outTradeNo = optionalString(input.order.out_trade_no);
    if (!outTradeNo) {
      this.deferFailure(input, claimToken, DIAGNOSTIC.outTradeNoRequired);
      return;
    }

    let context: BatchContext;
    try {
      context = await this.loadContext(configId, input.contextCache);
    } catch {
      this.deferFailure(input, claimToken, DIAGNOSTIC.paymentConfigFailed);
      return;
    }

    const renewNow = this.nowFactory();
    let renewed: TenantCreditOrderRecord | null;
    try {
      renewed = await this.repository.renewCloseClaim({
        orderId: input.order.id,
        claimToken,
        now: renewNow,
        leaseSeconds: this.leaseSeconds,
      });
    } catch {
      this.deferFailure(input, claimToken, DIAGNOSTIC.claimRenewFailed);
      return;
    }
    if (!renewed) {
      input.telemetry.retried += 1;
      return;
    }

    const outcome = await this.reconcileOwnedOrder({
      order: renewed,
      claimToken,
      outTradeNo,
      context,
      deferred: input.deferred,
    });
    input.telemetry[outcome] += 1;
  }

  private async reconcileOwnedOrder(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    outTradeNo: string;
    context: BatchContext;
    deferred: DeferredRelease[];
  }): Promise<OrderOutcome> {
    let transaction: WechatPayTransactionQueryResult;
    try {
      transaction = await this.query(input.context, input.outTradeNo);
    } catch {
      this.defer(input, DIAGNOSTIC.queryFailed);
      return "failed";
    }
    return this.handleQueriedState({ ...input, transaction });
  }

  private async handleQueriedState(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    outTradeNo: string;
    context: BatchContext;
    deferred: DeferredRelease[];
    transaction: WechatPayTransactionQueryResult;
  }): Promise<OrderOutcome> {
    const tradeState = optionalString(input.transaction.trade_state);
    if (tradeState === "SUCCESS") {
      return this.confirmPaid(input, input.transaction);
    }
    if (tradeState === "CLOSED") return this.markClosed(input);
    if (tradeState !== "NOTPAY") {
      this.defer(input, DIAGNOSTIC.tradeStateRetry);
      return "retried";
    }

    try {
      await this.wechatPayGateway.closeTransactionByOutTradeNo({
        config: input.context.config,
        outTradeNo: input.outTradeNo,
        secretBundle: input.context.secretBundle,
      });
      return this.markClosed(input);
    } catch {
      return this.reconcileAfterCloseFailure(input);
    }
  }

  private async reconcileAfterCloseFailure(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    outTradeNo: string;
    context: BatchContext;
    deferred: DeferredRelease[];
  }): Promise<OrderOutcome> {
    let transaction: WechatPayTransactionQueryResult;
    try {
      transaction = await this.query(input.context, input.outTradeNo);
    } catch {
      this.defer(input, DIAGNOSTIC.secondQueryFailed);
      return "failed";
    }

    const tradeState = optionalString(transaction.trade_state);
    if (tradeState === "SUCCESS") return this.confirmPaid(input, transaction);
    if (tradeState === "CLOSED") return this.markClosed(input);
    this.defer(input, DIAGNOSTIC.closeUncertain);
    return "retried";
  }

  private async confirmPaid(
    input: {
      order: TenantCreditOrderRecord;
      claimToken: string;
      deferred: DeferredRelease[];
    },
    transaction: WechatPayTransactionQueryResult,
  ): Promise<OrderOutcome> {
    try {
      await this.paymentConfirmation.confirm({
        order: input.order,
        transaction,
        notificationId: null,
        source: "expiration_reconcile",
      });
      return "paid";
    } catch {
      this.defer(input, DIAGNOSTIC.confirmFailed);
      return "failed";
    }
  }

  private async markClosed(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    deferred: DeferredRelease[];
  }): Promise<OrderOutcome> {
    try {
      const closed = await this.repository.markOrderClosed({
        orderId: input.order.id,
        claimToken: input.claimToken,
        closedAt: this.nowFactory(),
      });
      return closed ? "closed" : "retried";
    } catch {
      this.defer(input, DIAGNOSTIC.markClosedFailed);
      return "failed";
    }
  }

  private query(context: BatchContext, outTradeNo: string) {
    return this.wechatPayGateway.queryTransactionByOutTradeNo({
      config: context.config,
      outTradeNo,
      secretBundle: context.secretBundle,
    });
  }

  private loadContext(
    configId: string,
    cache: Map<string, Promise<BatchContext>>,
  ): Promise<BatchContext> {
    const cached = cache.get(configId);
    if (cached) return cached;
    const pending = this.loadContextUncached(configId);
    cache.set(configId, pending);
    return pending;
  }

  private async loadContextUncached(configId: string): Promise<BatchContext> {
    const config = await this.paymentConfigRepository
      .findWechatPayConfigById(configId);
    this.assertCleanupConfig(config, configId);
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    return { config, secretBundle };
  }

  private assertCleanupConfig(
    config: PlatformPaymentConfigRecord | null,
    configId: string,
  ): asserts config is PlatformPaymentConfigRecord {
    const commonReady = config?.id === configId &&
      config.provider === "wechat_pay" &&
      config.principal_type === "platform" &&
      ["active", "disabled", "suspended"].includes(config.status) &&
      Boolean(optionalString(config.merchant_id)) &&
      Boolean(optionalString(config.serial_no)) &&
      Boolean(optionalString(config.encrypted_config_ref));
    const profileModeReady =
      (config?.profile_code === "platform_direct_recharge" &&
        config.merchant_mode === "direct_merchant") ||
      (config?.profile_code === "tenant_service_provider" &&
        config.merchant_mode === "service_provider_sub_merchant" &&
        Boolean(optionalString(config.sub_merchant_id)));
    if (!commonReady || !profileModeReady) {
      throw Errors.business(
        409,
        "平台微信支付充值清理配置未就绪",
        "PLATFORM_WECHAT_PAY_RECHARGE_CLEANUP_CONFIG_NOT_READY",
      );
    }
  }

  private deferFailure(
    input: { order: TenantCreditOrderRecord; deferred: DeferredRelease[]; telemetry: BillingRechargeExpirationTelemetry },
    claimToken: string,
    diagnostic: string,
  ) {
    input.telemetry.failed += 1;
    input.deferred.push({ orderId: input.order.id, claimToken, diagnostic });
  }

  private defer(
    input: { order: TenantCreditOrderRecord; claimToken: string; deferred: DeferredRelease[] },
    diagnostic: string | null,
  ) {
    input.deferred.push({
      orderId: input.order.id,
      claimToken: input.claimToken,
      diagnostic,
    });
  }

  private async releaseDeferredClaims(
    deferred: DeferredRelease[],
    telemetry: BillingRechargeExpirationTelemetry,
  ) {
    for (const item of deferred) {
      try {
        await this.repository.releaseCloseClaim({
          orderId: item.orderId,
          claimToken: item.claimToken,
          errorMessage: item.diagnostic,
        });
      } catch {
        telemetry.release_failed += 1;
      }
    }
  }
}

function emptyTelemetry(): BillingRechargeExpirationTelemetry {
  return {
    claimed: 0,
    paid: 0,
    closed: 0,
    retried: 0,
    failed: 0,
    release_failed: 0,
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

export const billingRechargeExpirationService =
  new BillingRechargeExpirationService();
