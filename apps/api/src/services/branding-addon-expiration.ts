import { Errors } from "@/errors/error-factory";
import type { BrandingAddonExpirationOrderRecord } from "@/repositories/branding-addon-order-records";
import {
  brandingAddonExpirationRepository,
} from "@/repositories/branding-addon-expiration";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import {
  brandingAddonPaymentConfirmation,
  type BrandingAddonPaymentConfirmationInput,
} from "@/services/branding-addon-payment-confirmation";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
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

type RepositoryPort = Pick<
  typeof brandingAddonExpirationRepository,
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
  confirm(input: BrandingAddonPaymentConfirmationInput): Promise<unknown>;
};

export type BrandingAddonExpirationTelemetry = {
  claimed: number;
  paid: number;
  closed: number;
  retried: number;
  failed: number;
  release_failed: number;
  release_failures?: BrandingAddonExpirationReleaseFailure[];
};

export type BrandingAddonExpirationReleaseFailure = {
  order_id: string;
  diagnostic: string | null;
  error_code: "BRANDING_ADDON_EXPIRE_RELEASE_FAILED";
  error_message: "释放品牌权益订单关单租约失败";
};

export type BrandingAddonExpirationServiceDependencies = {
  repository?: RepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  paymentConfirmation?: PaymentConfirmationPort;
  nowFactory?: () => Date;
  leaseSeconds?: number;
};

type PaymentContext = {
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
  paymentContextFailed: "BRANDING_ADDON_EXPIRE_PAYMENT_CONTEXT_FAILED",
  claimRenewFailed: "BRANDING_ADDON_EXPIRE_CLAIM_RENEW_FAILED",
  queryFailed: "BRANDING_ADDON_EXPIRE_QUERY_FAILED",
  tradeStateRetry: "BRANDING_ADDON_EXPIRE_TRADE_STATE_RETRY",
  confirmFailed: "BRANDING_ADDON_EXPIRE_CONFIRM_FAILED",
  markClosedFailed: "BRANDING_ADDON_EXPIRE_MARK_CLOSED_FAILED",
  closeUncertain: "BRANDING_ADDON_EXPIRE_CLOSE_UNCERTAIN",
  secondQueryFailed: "BRANDING_ADDON_EXPIRE_SECOND_QUERY_FAILED",
} as const;

export class BrandingAddonExpirationService {
  private readonly repository: RepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly paymentConfirmation: PaymentConfirmationPort;
  private readonly nowFactory: () => Date;
  private readonly leaseSeconds: number;

  constructor(dependencies: BrandingAddonExpirationServiceDependencies = {}) {
    this.repository = dependencies.repository ?? brandingAddonExpirationRepository;
    this.paymentConfigRepository = dependencies.paymentConfigRepository ??
      platformPaymentConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.paymentConfirmation = dependencies.paymentConfirmation ??
      brandingAddonPaymentConfirmation;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.leaseSeconds = clampInteger(
      dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
      10,
      600,
    );
  }

  async runExpiredOrderChecks(
    input: { batchSize: number },
  ): Promise<BrandingAddonExpirationTelemetry> {
    const limit = clampInteger(input.batchSize, 1, 100);
    const telemetry = emptyTelemetry();
    const deferred: DeferredRelease[] = [];
    const contextCache = new Map<string, Promise<PaymentContext>>();
    const seenOrderIds: string[] = [];

    try {
      for (let index = 0; index < limit; index += 1) {
        const orders = await this.repository.claimExpiredOrders({
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
    order: BrandingAddonExpirationOrderRecord;
    contextCache: Map<string, Promise<PaymentContext>>;
    deferred: DeferredRelease[];
    telemetry: BrandingAddonExpirationTelemetry;
  }): Promise<void> {
    const claimToken = optionalString(input.order.close_claim_token);
    if (!claimToken) {
      input.telemetry.failed += 1;
      return;
    }

    let context: PaymentContext;
    try {
      context = await this.loadContext(
        input.order.payment_config_id,
        input.contextCache,
      );
      assertBoundPaymentContext(input.order, context.config);
    } catch {
      this.deferFailure(
        input,
        claimToken,
        DIAGNOSTIC.paymentContextFailed,
      );
      return;
    }

    let renewed: BrandingAddonExpirationOrderRecord | null;
    try {
      renewed = await this.repository.renewCloseClaim({
        orderId: input.order.id,
        claimToken,
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
      context,
      deferred: input.deferred,
    });
    input.telemetry[outcome] += 1;
  }

  private async reconcileOwnedOrder(input: OwnedOrderInput) {
    let transaction: WechatPayValidatedTransaction;
    try {
      transaction = await this.query(input);
    } catch (error) {
      if (canCloseNonexistentWechatOrder(input.order, error)) {
        return this.markClosed(input, true);
      }
      this.defer(input, DIAGNOSTIC.queryFailed);
      return "failed" as const;
    }
    return this.handleQueriedState({ ...input, transaction });
  }

  private async handleQueriedState(
    input: OwnedOrderInput & { transaction: WechatPayValidatedTransaction },
  ): Promise<OrderOutcome> {
    if (input.transaction.tradeState === "SUCCESS") {
      assertWechatPaySuccessTransaction(input.transaction);
      return this.confirmPaid(input, input.transaction);
    }
    if (input.transaction.tradeState === "CLOSED") {
      return this.markClosed(input);
    }
    if (input.transaction.tradeState !== "NOTPAY") {
      this.defer(input, DIAGNOSTIC.tradeStateRetry);
      return "retried";
    }

    const renewed = await this.renewForClose(input);
    if (!renewed) return "retried";
    const ownedInput = { ...input, order: renewed };
    let closeAccepted = false;
    try {
      await this.wechatPayGateway.closeTransactionByOutTradeNo({
        config: ownedInput.context.config,
        outTradeNo: ownedInput.order.out_trade_no,
        secretBundle: ownedInput.context.secretBundle,
      });
      closeAccepted = true;
    } catch {
      closeAccepted = false;
    }
    return this.reconcileAfterClose(ownedInput, closeAccepted);
  }

  private async renewForClose(
    input: OwnedOrderInput,
  ): Promise<BrandingAddonExpirationOrderRecord | null> {
    try {
      const renewed = await this.repository.renewCloseClaim({
        orderId: input.order.id,
        claimToken: input.claimToken,
        leaseSeconds: this.leaseSeconds,
      });
      if (!renewed) return null;
      assertBoundPaymentContext(renewed, input.context.config);
      return renewed;
    } catch {
      this.defer(input, DIAGNOSTIC.claimRenewFailed);
      return null;
    }
  }

  private async reconcileAfterClose(
    input: OwnedOrderInput,
    closeAccepted: boolean,
  ): Promise<OrderOutcome> {
    let transaction: WechatPayValidatedTransaction;
    try {
      transaction = await this.query(input);
    } catch (error) {
      if (canCloseNonexistentWechatOrder(input.order, error)) {
        return this.markClosed(input, true);
      }
      this.defer(input, DIAGNOSTIC.secondQueryFailed);
      return "failed";
    }

    if (transaction.tradeState === "SUCCESS") {
      assertWechatPaySuccessTransaction(transaction);
      return this.confirmPaid(input, transaction);
    }
    if (
      transaction.tradeState === "CLOSED" ||
      (closeAccepted && transaction.tradeState === "NOTPAY")
    ) {
      return this.markClosed(input);
    }
    this.defer(input, DIAGNOSTIC.closeUncertain);
    return "retried";
  }

  private async confirmPaid(
    input: OwnedOrderInput,
    transaction: WechatPayValidatedSuccessTransaction,
  ): Promise<OrderOutcome> {
    try {
      await this.paymentConfirmation.confirm({
        order: input.order,
        transaction: {
          ...transaction,
          appid: input.order.payment_appid,
        },
        notificationId: null,
        source: "expiration_reconcile",
      });
      return "paid";
    } catch {
      this.defer(input, DIAGNOSTIC.confirmFailed);
      return "failed";
    }
  }

  private async markClosed(
    input: OwnedOrderInput,
    requireMissingPrepay = false,
  ): Promise<OrderOutcome> {
    try {
      const closed = await this.repository.markOrderClosed({
        orderId: input.order.id,
        claimToken: input.claimToken,
        closedAt: this.nowFactory(),
        ...(requireMissingPrepay ? { requireMissingPrepay: true } : {}),
      });
      return closed ? "closed" : "retried";
    } catch {
      this.defer(input, DIAGNOSTIC.markClosedFailed);
      return "failed";
    }
  }

  private async query(input: Pick<OwnedOrderInput, "order" | "context">) {
    const payload = await this.wechatPayGateway.queryTransactionByOutTradeNo({
      config: input.context.config,
      outTradeNo: input.order.out_trade_no,
      secretBundle: input.context.secretBundle,
    });
    return parseAndAssertWechatPayTransactionQuery(
      payload,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: "direct_merchant",
        merchantId: input.order.payment_mchid,
        subMerchantId: null,
        outTradeNo: input.order.out_trade_no,
        amountFen: input.order.amount_fen,
        transactionId: input.order.transaction_id,
      }),
    );
  }

  private loadContext(
    configId: string,
    cache: Map<string, Promise<PaymentContext>>,
  ) {
    const cached = cache.get(configId);
    if (cached) return cached;
    const pending = this.loadContextUncached(configId);
    cache.set(configId, pending);
    return pending;
  }

  private async loadContextUncached(configId: string): Promise<PaymentContext> {
    const config = await this.paymentConfigRepository
      .findWechatPayConfigById(configId);
    if (!config) throw paymentContextInvalid();
    const secretBundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.secretBundleService.load(config.encrypted_config_ref),
    );
    return { config, secretBundle };
  }

  private deferFailure(
    input: {
      order: BrandingAddonExpirationOrderRecord;
      deferred: DeferredRelease[];
      telemetry: BrandingAddonExpirationTelemetry;
    },
    claimToken: string,
    diagnostic: string,
  ) {
    input.telemetry.failed += 1;
    input.deferred.push({ orderId: input.order.id, claimToken, diagnostic });
  }

  private defer(input: OwnedOrderInput, diagnostic: string | null) {
    input.deferred.push({
      orderId: input.order.id,
      claimToken: input.claimToken,
      diagnostic,
    });
  }

  private async releaseDeferredClaims(
    deferred: DeferredRelease[],
    telemetry: BrandingAddonExpirationTelemetry,
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
        telemetry.release_failures ??= [];
        telemetry.release_failures.push({
          order_id: item.orderId,
          diagnostic: item.diagnostic,
          error_code: "BRANDING_ADDON_EXPIRE_RELEASE_FAILED",
          error_message: "释放品牌权益订单关单租约失败",
        });
      }
    }
  }
}

type OwnedOrderInput = {
  order: BrandingAddonExpirationOrderRecord;
  claimToken: string;
  context: PaymentContext;
  deferred: DeferredRelease[];
};

function assertBoundPaymentContext(
  order: BrandingAddonExpirationOrderRecord,
  config: PlatformPaymentConfigRecord,
) {
  const ready = config.id === order.payment_config_id &&
    config.provider === "wechat_pay" &&
    config.profile_code === "platform_direct_recharge" &&
    config.principal_type === "platform" &&
    config.merchant_mode === "direct_merchant" &&
    ["active", "disabled", "suspended"].includes(config.status) &&
    config.merchant_id === order.payment_mchid &&
    config.app_id === order.payment_appid &&
    config.recharge_guard_version === order.expected_guard_version &&
    Boolean(optionalString(config.serial_no)) &&
    Boolean(optionalString(config.encrypted_config_ref));
  if (!ready) throw paymentContextInvalid();
}

function canCloseNonexistentWechatOrder(
  order: BrandingAddonExpirationOrderRecord,
  error: unknown,
) {
  if (optionalString(order.prepay_id)) return false;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; details?: unknown };
  if (candidate.code !== "WECHAT_PAY_TRANSACTION_QUERY_FAILED") return false;
  if (!candidate.details || typeof candidate.details !== "object") return false;
  const details = candidate.details as { status?: unknown; code?: unknown };
  return details.status === 404 && details.code === "ORDER_NOT_EXIST";
}

function paymentContextInvalid() {
  return Errors.business(
    409,
    "品牌权益订单支付配置不匹配",
    "BRANDING_ADDON_PAYMENT_CONTEXT_INVALID",
  );
}

function emptyTelemetry(): BrandingAddonExpirationTelemetry {
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

export const brandingAddonExpirationService =
  new BrandingAddonExpirationService();
