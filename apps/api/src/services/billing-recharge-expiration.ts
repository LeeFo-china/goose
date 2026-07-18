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
  "claimExpiredOrders" | "markOrderClosed" | "releaseCloseClaim"
>;
type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig"
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

type OrderOutcome = "paid" | "closed" | "retried" | "failed";

const RECHARGE_CHANNEL = "tenant_recharge";
const DEFAULT_LEASE_SECONDS = 60;
const DIAGNOSTIC = {
  batchConfigFailed: "BILLING_RECHARGE_EXPIRE_BATCH_CONFIG_FAILED",
  outTradeNoRequired: "BILLING_RECHARGE_EXPIRE_OUT_TRADE_NO_REQUIRED",
  paymentConfigMismatch: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_MISMATCH",
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

  async runExpiredOrderChecks(input: { batchSize: number }) {
    const now = this.nowFactory();
    const orders = await this.repository.claimExpiredOrders({
      now,
      batchSize: clampInteger(input.batchSize, 1, 100),
      leaseSeconds: this.leaseSeconds,
    });
    const telemetry = emptyTelemetry(orders.length);
    if (orders.length === 0) return telemetry;

    let context: BatchContext;
    try {
      context = await this.loadBatchContext();
    } catch {
      await this.releaseBatchClaims(orders, DIAGNOSTIC.batchConfigFailed);
      telemetry.failed = orders.length;
      return telemetry;
    }

    for (const order of orders) {
      const outcome = await this.processOrder(order, context, now);
      telemetry[outcome] += 1;
    }
    return telemetry;
  }

  private async loadBatchContext(): Promise<BatchContext> {
    const config = await this.paymentConfigRepository.findWechatPayConfig();
    this.assertRechargeConfig(config);
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    return { config, secretBundle };
  }

  private async processOrder(
    order: TenantCreditOrderRecord,
    context: BatchContext,
    now: Date,
  ): Promise<OrderOutcome> {
    const claimToken = optionalString(order.close_claim_token);
    if (!claimToken) return "failed";

    const outTradeNo = optionalString(order.out_trade_no);
    if (!outTradeNo) {
      await this.release(order, claimToken, DIAGNOSTIC.outTradeNoRequired);
      return "failed";
    }
    if (order.payment_config_id !== context.config.id) {
      await this.release(order, claimToken, DIAGNOSTIC.paymentConfigMismatch);
      return "failed";
    }

    let transaction: WechatPayTransactionQueryResult;
    try {
      transaction = await this.query(context, outTradeNo);
    } catch {
      await this.release(order, claimToken, DIAGNOSTIC.queryFailed);
      return "failed";
    }
    return this.handleQueriedState({
      order,
      claimToken,
      outTradeNo,
      transaction,
      context,
      now,
    });
  }

  private async handleQueriedState(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    outTradeNo: string;
    transaction: WechatPayTransactionQueryResult;
    context: BatchContext;
    now: Date;
  }): Promise<OrderOutcome> {
    const tradeState = optionalString(input.transaction.trade_state);
    if (tradeState === "SUCCESS") {
      return this.confirmPaid(input.order, input.claimToken, input.transaction);
    }
    if (tradeState === "CLOSED") {
      return this.markClosed(input.order, input.claimToken, input.now);
    }
    if (tradeState !== "NOTPAY") {
      await this.release(
        input.order,
        input.claimToken,
        DIAGNOSTIC.tradeStateRetry,
      );
      return "retried";
    }

    try {
      await this.wechatPayGateway.closeTransactionByOutTradeNo({
        config: input.context.config,
        outTradeNo: input.outTradeNo,
        secretBundle: input.context.secretBundle,
      });
      return this.markClosed(input.order, input.claimToken, input.now);
    } catch {
      return this.reconcileAfterCloseFailure(input);
    }
  }

  private async reconcileAfterCloseFailure(input: {
    order: TenantCreditOrderRecord;
    claimToken: string;
    outTradeNo: string;
    context: BatchContext;
    now: Date;
  }): Promise<OrderOutcome> {
    let transaction: WechatPayTransactionQueryResult;
    try {
      transaction = await this.query(input.context, input.outTradeNo);
    } catch {
      await this.release(
        input.order,
        input.claimToken,
        DIAGNOSTIC.secondQueryFailed,
      );
      return "failed";
    }

    const tradeState = optionalString(transaction.trade_state);
    if (tradeState === "SUCCESS") {
      return this.confirmPaid(input.order, input.claimToken, transaction);
    }
    if (tradeState === "CLOSED") {
      return this.markClosed(input.order, input.claimToken, input.now);
    }
    await this.release(
      input.order,
      input.claimToken,
      DIAGNOSTIC.closeUncertain,
    );
    return "retried";
  }

  private query(context: BatchContext, outTradeNo: string) {
    return this.wechatPayGateway.queryTransactionByOutTradeNo({
      config: context.config,
      outTradeNo,
      secretBundle: context.secretBundle,
    });
  }

  private async confirmPaid(
    order: TenantCreditOrderRecord,
    claimToken: string,
    transaction: WechatPayTransactionQueryResult,
  ): Promise<OrderOutcome> {
    try {
      await this.paymentConfirmation.confirm({
        order,
        transaction,
        notificationId: null,
        source: "expiration_reconcile",
      });
    } catch {
      await this.release(order, claimToken, DIAGNOSTIC.confirmFailed);
      return "failed";
    }
    await this.release(order, claimToken, null);
    return "paid";
  }

  private async markClosed(
    order: TenantCreditOrderRecord,
    claimToken: string,
    now: Date,
  ): Promise<OrderOutcome> {
    try {
      const closed = await this.repository.markOrderClosed({
        orderId: order.id,
        claimToken,
        closedAt: now,
      });
      return closed ? "closed" : "retried";
    } catch {
      await this.release(order, claimToken, DIAGNOSTIC.markClosedFailed);
      return "failed";
    }
  }

  private async releaseBatchClaims(
    orders: TenantCreditOrderRecord[],
    diagnostic: string,
  ) {
    for (const order of orders) {
      const claimToken = optionalString(order.close_claim_token);
      if (claimToken) await this.release(order, claimToken, diagnostic);
    }
  }

  private async release(
    order: TenantCreditOrderRecord,
    claimToken: string,
    errorMessage: string | null,
  ) {
    try {
      await this.repository.releaseCloseClaim({
        orderId: order.id,
        claimToken,
        errorMessage,
      });
      return true;
    } catch {
      // Isolate one release failure so every later claimed order still gets an attempt.
      return false;
    }
  }

  private assertRechargeConfig(
    config: PlatformPaymentConfigRecord | null,
  ): asserts config is PlatformPaymentConfigRecord {
    const isReady = config?.provider === "wechat_pay" &&
      config.profile_code === "platform_direct_recharge" &&
      config.principal_type === "platform" &&
      config.status === "active" &&
      config.enabled_channels.includes(RECHARGE_CHANNEL) &&
      Boolean(config.merchant_id?.trim()) &&
      Boolean(config.serial_no?.trim()) &&
      Boolean(config.encrypted_config_ref?.trim());
    if (!isReady) {
      throw Errors.business(
        409,
        "平台微信支付充值配置未就绪",
        "PLATFORM_WECHAT_PAY_RECHARGE_CONFIG_NOT_READY",
      );
    }
  }
}

function emptyTelemetry(claimed: number): BillingRechargeExpirationTelemetry {
  return { claimed, paid: 0, closed: 0, retried: 0, failed: 0 };
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
