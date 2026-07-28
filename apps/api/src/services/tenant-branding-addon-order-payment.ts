import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
  type BrandingAddonPaymentOrderRecord,
} from "@/repositories/branding-addon-orders";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import {
  isPlatformPaymentSecretBundleRevisionError,
  requireMatchingPlatformPaymentSecretBundle,
} from "@/services/platform-payment-secret-bundle-revision";
import {
  wechatPayGateway,
  type WechatPayCreateJsapiPrepayResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

const PAYMENT_CHANNEL = "tenant_recharge";

export type BrandingAddonPaymentOrderRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  | "markPrepayCreated"
  | "findInternalTenantOrderById"
>;
export type BrandingAddonPaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig" | "findWechatPayConfigById"
>;
export type BrandingAddonSecretBundleServicePort = Pick<
  typeof wechatPaySecretBundleService,
  "load"
>;
export type BrandingAddonGatewayPort = {
  createJsapiPrepay(input: {
    config: PlatformPaymentConfigRecord;
    order: {
      out_trade_no: string;
      amount: number;
      payer_openid: string;
      payment_expires_at: string;
    };
    description: string;
    secretBundle: WechatPaySecretBundle;
  }): Promise<WechatPayCreateJsapiPrepayResult>;
  createMiniProgramPaymentRequest:
    typeof wechatPayGateway.createMiniProgramPaymentRequest;
};

type PaymentDependencies = {
  orderRepository: BrandingAddonPaymentOrderRepositoryPort;
  paymentConfigRepository: BrandingAddonPaymentConfigRepositoryPort;
  secretBundleService: BrandingAddonSecretBundleServicePort;
  gateway: BrandingAddonGatewayPort;
  nowFactory: () => Date;
};

export class TenantBrandingAddonOrderPayment {
  constructor(private readonly dependencies: PaymentDependencies) {}

  async preflight() {
    const active = requireActiveAddonPaymentConfig(
      await this.findActiveConfig(),
    );
    await this.loadSecretBundle(active.config);
    return active;
  }

  async createInitialPrepay(order: BrandingAddonPaymentOrderRecord) {
    const context = await this.loadBoundPaymentContext(order);
    const prepay = await this.createPrepay(
      order,
      context.config,
      context.secretBundle,
    );
    const marked = await this.dependencies.orderRepository.markPrepayCreated({
      tenantId: order.tenant_id,
      orderId: order.id,
      prepayId: prepay.prepayId,
      now: this.dependencies.nowFactory(),
    });
    const finalOrder = marked ??
      await this.dependencies.orderRepository.findInternalTenantOrderById({
        tenantId: order.tenant_id,
        orderId: order.id,
      });
    if (!finalOrder) throw orderNotFound();
    return {
      order: finalOrder,
      paymentRequest: marked ? prepay.paymentRequest : null,
    };
  }

  async preparePaymentRequest(order: BrandingAddonPaymentOrderRecord) {
    this.assertPayable(order, this.dependencies.nowFactory());
    const context = await this.loadBoundPaymentContext(order);
    if (order.prepay_id?.trim()) {
      return this.dependencies.gateway.createMiniProgramPaymentRequest({
        config: context.config,
        prepayId: order.prepay_id,
        secretBundle: context.secretBundle,
      });
    }

    const prepay = await this.createPrepay(
      order,
      context.config,
      context.secretBundle,
    );
    const marked = await this.dependencies.orderRepository.markPrepayCreated({
      tenantId: order.tenant_id,
      orderId: order.id,
      prepayId: prepay.prepayId,
      now: this.dependencies.nowFactory(),
    });
    if (marked) return prepay.paymentRequest;

    const latest = await this.dependencies.orderRepository
      .findInternalTenantOrderById({
        tenantId: order.tenant_id,
        orderId: order.id,
      });
    if (!latest) throw orderNotFound();
    this.assertPayable(latest, this.dependencies.nowFactory());
    if (!latest.prepay_id?.trim()) {
      throw Errors.business(
        409,
        "年度品牌权益订单暂无可用支付请求",
        "BRANDING_ADDON_PAYMENT_REQUEST_UNAVAILABLE",
      );
    }
    return this.dependencies.gateway.createMiniProgramPaymentRequest({
      config: context.config,
      prepayId: latest.prepay_id,
      secretBundle: context.secretBundle,
    });
  }

  assertPayable(order: BrandingAddonPaymentOrderRecord, now: Date) {
    if (order.status !== "pending" || order.channel !== "wechat_pay") {
      throw Errors.business(
        409,
        "年度品牌权益订单不是待支付状态",
        "BRANDING_ADDON_ORDER_NOT_PENDING",
      );
    }
    const expiresAt = Date.parse(order.payment_expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      throw Errors.business(
        409,
        "年度品牌权益订单支付时间已结束",
        "BRANDING_ADDON_ORDER_EXPIRED",
      );
    }
  }

  private async loadBoundPaymentContext(
    order: BrandingAddonPaymentOrderRecord,
  ) {
    const config = await this.findConfigById(order.payment_config_id);
    let active: ReturnType<typeof requireActiveAddonPaymentConfig>;
    try {
      active = requireActiveAddonPaymentConfig(config);
    } catch {
      throw paymentConfigChanged();
    }
    if (
      active.config.id !== order.payment_config_id ||
      active.guardVersion !== order.expected_guard_version ||
      active.config.merchant_id !== order.payment_mchid ||
      active.config.app_id !== order.payment_appid
    ) {
      throw paymentConfigChanged();
    }
    return {
      config: active.config,
      secretBundle: await this.loadSecretBundle(active.config),
    };
  }

  private async findActiveConfig() {
    try {
      return await this.dependencies.paymentConfigRepository
        .findWechatPayConfig();
    } catch {
      throw Errors.dbError("查询平台微信支付配置失败");
    }
  }

  private async findConfigById(configId: string) {
    try {
      return await this.dependencies.paymentConfigRepository
        .findWechatPayConfigById(configId);
    } catch {
      throw Errors.dbError("查询平台微信支付配置失败");
    }
  }

  private async loadSecretBundle(config: PlatformPaymentConfigRecord) {
    return requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.dependencies.secretBundleService.load(
        config.encrypted_config_ref,
      ),
    );
  }

  private createPrepay(
    order: BrandingAddonPaymentOrderRecord,
    config: PlatformPaymentConfigRecord,
    secretBundle: WechatPaySecretBundle,
  ) {
    return this.dependencies.gateway.createJsapiPrepay({
      config,
      order: {
        out_trade_no: order.out_trade_no,
        amount: order.amount_fen / 100,
        payer_openid: order.payer_openid,
        payment_expires_at: order.payment_expires_at,
      },
      description: order.product_name,
      secretBundle,
    });
  }
}

function requireActiveAddonPaymentConfig(
  config: PlatformPaymentConfigRecord | null,
) {
  if (
    !config ||
    config.profile_code !== "platform_direct_recharge" ||
    config.merchant_mode !== "direct_merchant" ||
    config.status !== "active" ||
    config.validation_status !== "valid" ||
    !config.enabled_channels.includes(PAYMENT_CHANNEL) ||
    !config.merchant_id ||
    !config.app_id ||
    !config.encrypted_config_ref ||
    !config.secret_bundle_revision?.trim() ||
    !config.serial_no ||
    !config.notify_url ||
    !Number.isSafeInteger(config.recharge_guard_version) ||
    Number(config.recharge_guard_version) <= 0
  ) {
    throw Errors.business(
      409,
      "平台微信支付配置未就绪",
      "BRANDING_ADDON_PAYMENT_CONFIG_INVALID",
    );
  }
  return {
    config: config as PlatformPaymentConfigRecord & {
      merchant_id: string;
      app_id: string;
      encrypted_config_ref: string;
    },
    guardVersion: Number(config.recharge_guard_version),
  };
}

function orderNotFound() {
  return Errors.business(
    404,
    "年度品牌权益订单不存在",
    "BRANDING_ADDON_ORDER_NOT_FOUND",
  );
}

function paymentConfigChanged() {
  return Errors.business(
    409,
    "微信支付配置已更新，请重新发起购买",
    "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
  );
}

export function isBrandingAddonPostInsertPaymentGuardError(error: unknown) {
  return readErrorCode(error) ===
      "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED" ||
    isPlatformPaymentSecretBundleRevisionError(error);
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
