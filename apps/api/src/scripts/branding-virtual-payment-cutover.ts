import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonExpirationOrderRecord,
} from "@/repositories/branding-addon-order-records";
import {
  brandingAddonExpirationRepository,
} from "@/repositories/branding-addon-expiration";
import {
  brandingAddonProductRepository,
} from "@/repositories/branding-addon-products";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import {
  brandingAddonPaymentConfirmation,
  type BrandingAddonPaymentConfirmationInput,
  type BrandingAddonValidatedSuccessTransaction,
} from "@/services/branding-addon-payment-confirmation";
import {
  assertBoundBrandingAddonPaymentContext,
  canCloseNonexistentBrandingAddonOrder,
  hasMatchingBrandingAddonAppid,
  optionalString,
} from "@/services/branding-addon-expiration-validation";
import {
  requireMatchingPlatformPaymentSecretBundle,
} from "@/services/platform-payment-secret-bundle-revision";
import { wechatPayGateway } from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
} from "@/services/wechat-pay-transaction-contract";

type ProductRepositoryPort = {
  getProduct(): Promise<{ purchase_mode: string } | null>;
};
type RepositoryPort = Pick<
  typeof brandingAddonExpirationRepository,
  | "claimLegacyPendingOrders"
  | "renewCloseClaim"
  | "markOrderClosed"
  | "releaseCloseClaim"
  | "assertVirtualCutoverReady"
>;
type PaymentConfirmationPort = {
  confirm(input: BrandingAddonPaymentConfirmationInput): Promise<unknown>;
};
export type LegacyPaymentQueryResult =
  | {
    tradeState: "SUCCESS";
    transaction: BrandingAddonValidatedSuccessTransaction;
  }
  | { tradeState: "NOTPAY" | "CLOSED" | "UNKNOWN" };
type LegacyPaymentChannelPort = {
  queryOrder(
    order: BrandingAddonExpirationOrderRecord,
  ): Promise<LegacyPaymentQueryResult>;
  closeOrder(order: BrandingAddonExpirationOrderRecord): Promise<void>;
};

export type BrandingVirtualPaymentCutoverResult = {
  claimed: number;
  paid: number;
  closed: number;
  unresolved: number;
  release_failed: number;
  allow_switch: boolean;
  message: "允许切换" | "仍有未决订单或配置未就绪";
};

export class BrandingVirtualPaymentCutover {
  private readonly productRepository: ProductRepositoryPort;
  private readonly repository: RepositoryPort;
  private readonly paymentChannel: LegacyPaymentChannelPort;
  private readonly paymentConfirmation: PaymentConfirmationPort;
  private readonly nowFactory: () => Date;
  private readonly leaseSeconds: number;

  constructor(dependencies: {
    productRepository?: ProductRepositoryPort;
    repository?: RepositoryPort;
    paymentChannel?: LegacyPaymentChannelPort;
    paymentConfirmation?: PaymentConfirmationPort;
    nowFactory?: () => Date;
    leaseSeconds?: number;
  } = {}) {
    this.productRepository = dependencies.productRepository ??
      brandingAddonProductRepository;
    this.repository = dependencies.repository ??
      brandingAddonExpirationRepository;
    this.paymentChannel = dependencies.paymentChannel ??
      new LegacyBrandingPaymentChannel();
    this.paymentConfirmation = dependencies.paymentConfirmation ??
      brandingAddonPaymentConfirmation;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.leaseSeconds = clampInteger(dependencies.leaseSeconds ?? 60, 10, 600);
  }

  async runBatch(
    input: { limit: number },
  ): Promise<BrandingVirtualPaymentCutoverResult> {
    await this.assertMaintenanceMode();
    const orders = await this.repository.claimLegacyPendingOrders({
      batchSize: clampInteger(input.limit, 1, 100),
      leaseSeconds: this.leaseSeconds,
    });
    const result = emptyResult(orders.length);

    for (const order of orders) {
      await this.processOrder(order, result);
    }

    if (result.unresolved === 0 && result.release_failed === 0) {
      result.allow_switch = await this.repository.assertVirtualCutoverReady();
    }
    result.message = result.allow_switch
      ? "允许切换"
      : "仍有未决订单或配置未就绪";
    return result;
  }

  private async assertMaintenanceMode() {
    const product = await this.productRepository.getProduct();
    if (product?.purchase_mode !== "maintenance") {
      throw Errors.business(
        409,
        "请先将品牌权益购买模式切换为维护中",
        "BRANDING_VIRTUAL_CUTOVER_REQUIRES_MAINTENANCE",
      );
    }
  }

  private async processOrder(
    claimed: BrandingAddonExpirationOrderRecord,
    result: BrandingVirtualPaymentCutoverResult,
  ) {
    const claimToken = optionalString(claimed.close_claim_token);
    if (!claimToken) {
      result.unresolved += 1;
      return;
    }
    const order = await this.renew(claimed, claimToken);
    if (!order) {
      result.unresolved += 1;
      return;
    }

    let query: LegacyPaymentQueryResult;
    try {
      query = await this.paymentChannel.queryOrder(order);
    } catch (error) {
      if (canCloseNonexistentBrandingAddonOrder(order, error)) {
        await this.closeLocal(order, claimToken, result, true);
        return;
      }
      await this.release(order, claimToken, result,
        "BRANDING_VIRTUAL_CUTOVER_QUERY_FAILED");
      return;
    }
    await this.handleQuery(order, claimToken, query, result);
  }

  private async handleQuery(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
    query: LegacyPaymentQueryResult,
    result: BrandingVirtualPaymentCutoverResult,
  ) {
    if (query.tradeState === "SUCCESS") {
      await this.confirmPaid(order, claimToken, query.transaction, result);
      return;
    }
    if (query.tradeState === "CLOSED") {
      await this.closeLocal(order, claimToken, result);
      return;
    }
    if (query.tradeState !== "NOTPAY") {
      await this.release(order, claimToken, result,
        "BRANDING_VIRTUAL_CUTOVER_TRADE_STATE_UNKNOWN");
      return;
    }
    await this.closeRemote(order, claimToken, result);
  }

  private async closeRemote(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
    result: BrandingVirtualPaymentCutoverResult,
  ) {
    const renewed = await this.renew(order, claimToken);
    if (!renewed) {
      result.unresolved += 1;
      return;
    }
    let closeAccepted = false;
    try {
      await this.paymentChannel.closeOrder(renewed);
      closeAccepted = true;
    } catch {
      closeAccepted = false;
    }

    let confirmed: LegacyPaymentQueryResult;
    try {
      confirmed = await this.paymentChannel.queryOrder(renewed);
    } catch (error) {
      if (canCloseNonexistentBrandingAddonOrder(renewed, error)) {
        await this.closeLocal(renewed, claimToken, result, true);
        return;
      }
      await this.release(renewed, claimToken, result,
        "BRANDING_VIRTUAL_CUTOVER_CLOSE_UNCERTAIN");
      return;
    }
    if (confirmed.tradeState === "SUCCESS") {
      await this.confirmPaid(
        renewed,
        claimToken,
        confirmed.transaction,
        result,
      );
      return;
    }
    if (
      confirmed.tradeState === "CLOSED" ||
      (closeAccepted && confirmed.tradeState === "NOTPAY")
    ) {
      await this.closeLocal(renewed, claimToken, result);
      return;
    }
    await this.release(renewed, claimToken, result,
      "BRANDING_VIRTUAL_CUTOVER_CLOSE_UNCERTAIN");
  }

  private async confirmPaid(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
    transaction: BrandingAddonValidatedSuccessTransaction,
    result: BrandingVirtualPaymentCutoverResult,
  ) {
    try {
      await this.paymentConfirmation.confirm({
        order,
        transaction,
        notificationId: null,
        source: "virtual_payment_cutover",
      });
      result.paid += 1;
    } catch {
      await this.release(order, claimToken, result,
        "BRANDING_VIRTUAL_CUTOVER_CONFIRM_FAILED");
    }
  }

  private async closeLocal(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
    result: BrandingVirtualPaymentCutoverResult,
    requireMissingPrepay = false,
  ) {
    try {
      const closed = await this.repository.markOrderClosed({
        orderId: order.id,
        claimToken,
        closedAt: this.nowFactory(),
        failureCode: "PAYMENT_CHANNEL_MIGRATED",
        failureMessage: "品牌权益已迁移至微信虚拟支付，旧支付订单已关闭",
        ...(requireMissingPrepay ? { requireMissingPrepay: true } : {}),
      });
      if (closed) {
        result.closed += 1;
        return;
      }
    } catch {
      // Release below retains the pending order for a later safe retry.
    }
    await this.release(order, claimToken, result,
      "BRANDING_VIRTUAL_CUTOVER_MARK_CLOSED_FAILED");
  }

  private async renew(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
  ) {
    try {
      return await this.repository.renewCloseClaim({
        orderId: order.id,
        claimToken,
        leaseSeconds: this.leaseSeconds,
      });
    } catch {
      return null;
    }
  }

  private async release(
    order: BrandingAddonExpirationOrderRecord,
    claimToken: string,
    result: BrandingVirtualPaymentCutoverResult,
    errorMessage: string,
  ) {
    result.unresolved += 1;
    try {
      await this.repository.releaseCloseClaim({
        orderId: order.id,
        claimToken,
        errorMessage,
      });
    } catch {
      result.release_failed += 1;
    }
  }
}

class LegacyBrandingPaymentChannel implements LegacyPaymentChannelPort {
  private readonly contextCache = new Map<string, Promise<PaymentContext>>();

  async queryOrder(order: BrandingAddonExpirationOrderRecord) {
    const context = await this.loadContext(order);
    const payload = await wechatPayGateway.queryTransactionByOutTradeNo({
      config: context.config,
      outTradeNo: order.out_trade_no,
      secretBundle: context.secretBundle,
    });
    const transaction = parseAndAssertWechatPayTransactionQuery(
      payload,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: "direct_merchant",
        merchantId: order.payment_mchid,
        subMerchantId: null,
        outTradeNo: order.out_trade_no,
        amountFen: order.amount_fen,
        transactionId: order.transaction_id,
      }),
    );
    if (transaction.tradeState !== "SUCCESS") {
      return transaction.tradeState === "NOTPAY" ||
          transaction.tradeState === "CLOSED"
        ? { tradeState: transaction.tradeState }
        : { tradeState: "UNKNOWN" as const };
    }
    assertWechatPaySuccessTransaction(transaction);
    if (!hasMatchingBrandingAddonAppid(transaction, order.payment_appid)) {
      throw Errors.business(
        409,
        "旧品牌权益订单支付 AppID 不匹配",
        "BRANDING_VIRTUAL_CUTOVER_PAYMENT_CONTEXT_INVALID",
      );
    }
    return { tradeState: "SUCCESS" as const, transaction };
  }

  async closeOrder(order: BrandingAddonExpirationOrderRecord) {
    const context = await this.loadContext(order);
    await wechatPayGateway.closeTransactionByOutTradeNo({
      config: context.config,
      outTradeNo: order.out_trade_no,
      secretBundle: context.secretBundle,
    });
  }

  private loadContext(order: BrandingAddonExpirationOrderRecord) {
    const cached = this.contextCache.get(order.payment_config_id);
    if (cached) return cached;
    const pending = this.loadContextUncached(order);
    this.contextCache.set(order.payment_config_id, pending);
    return pending;
  }

  private async loadContextUncached(order: BrandingAddonExpirationOrderRecord) {
    const config = await platformPaymentConfigRepository
      .findWechatPayConfigById(order.payment_config_id);
    if (!config) {
      throw Errors.business(
        409,
        "旧品牌权益订单支付配置不存在",
        "BRANDING_VIRTUAL_CUTOVER_PAYMENT_CONTEXT_INVALID",
      );
    }
    assertBoundBrandingAddonPaymentContext(order, config);
    const secretBundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await wechatPaySecretBundleService.load(config.encrypted_config_ref),
    );
    return { config, secretBundle };
  }
}

type PaymentContext = {
  config: PlatformPaymentConfigRecord;
  secretBundle: WechatPaySecretBundle;
};

function emptyResult(claimed: number): BrandingVirtualPaymentCutoverResult {
  return {
    claimed,
    paid: 0,
    closed: 0,
    unresolved: 0,
    release_failed: 0,
    allow_switch: false,
    message: "仍有未决订单或配置未就绪",
  };
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

function parseLimit(argv: string[]) {
  const flagIndex = argv.findIndex((value) => value === "--limit");
  if (flagIndex < 0) return 100;
  const value = Number(argv[flagIndex + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw Errors.badRequest("--limit 必须是大于 0 的整数");
  }
  return clampInteger(value, 1, 100);
}

async function main() {
  const result = await new BrandingVirtualPaymentCutover().runBatch({
    limit: parseLimit(process.argv.slice(2)),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.allow_switch) process.exitCode = 2;
}

if (import.meta.main) {
  main().catch((error) => {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
    };
    console.error(JSON.stringify({
      code: typeof candidate.code === "string" ? candidate.code : "CUTOVER_FAILED",
      message: typeof candidate.message === "string"
        ? candidate.message
        : "虚拟支付切换检查失败",
      status: typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : 500,
    }));
    process.exit(1);
  });
}
