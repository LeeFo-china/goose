import type { BrandingVirtualProductManagementService } from
  "@/services/branding-virtual-product-management";
import {
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import type { PlatformBrandingVirtualPaymentSecretService } from
  "@/services/platform-branding-virtual-payment-secrets";
import {
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  type BrandingPurchaseMode,
} from "@gooes/domain";

const PAYMENT_SETTINGS_HREF =
  "/settings?group=payment&section=virtual&environment=production";

export const PLATFORM_BRANDING_VIRTUAL_PAYMENT_READINESS_CODES = [
  "PRODUCT_DISABLED",
  "PRODUCT_AMOUNT",
  "PRODUCTION_MAPPING_REQUIRED",
  "PRODUCTION_MAPPING_DISABLED",
  "PRODUCTION_MAPPING_INVALID",
  "PRODUCTION_MAPPING_AMOUNT_MISMATCH",
  "PRODUCTION_MAPPING_SECRET",
  "MESSAGE_TOKEN_MISSING",
  "MESSAGE_TOKEN_INVALID",
  "ORIGINAL_ID_MISSING",
  "ORIGINAL_ID_INVALID",
] as const;

export type PlatformBrandingVirtualPaymentReadinessCode =
  typeof PLATFORM_BRANDING_VIRTUAL_PAYMENT_READINESS_CODES[number];

export type PlatformBrandingVirtualPaymentReadiness = {
  ready: boolean;
  blockers: Array<{
    code: PlatformBrandingVirtualPaymentReadinessCode;
    message: string;
    settings_href?: string;
  }>;
};

type VirtualPaymentConfiguration = Awaited<ReturnType<
  BrandingVirtualProductManagementService["getConfiguration"]
>>;
type VirtualPaymentSecretStatuses = Awaited<ReturnType<
  PlatformBrandingVirtualPaymentSecretService["getStatuses"]
>>;

export function evaluatePlatformBrandingVirtualPaymentReadiness(
  configuration: VirtualPaymentConfiguration,
  secretStatuses: VirtualPaymentSecretStatuses,
): PlatformBrandingVirtualPaymentReadiness {
  const blockers: PlatformBrandingVirtualPaymentReadiness["blockers"] = [];
  const add = (
    code: PlatformBrandingVirtualPaymentReadinessCode,
    message: string,
    settingsHref?: string,
  ) => blockers.push({
    code,
    message,
    ...(settingsHref ? { settings_href: settingsHref } : {}),
  });

  if (!configuration.product.enabled) {
    add("PRODUCT_DISABLED", "请先启用年度品牌权益商品", "/platform/branding-addon");
  }
  if (
    configuration.product.amount_fen === null ||
    configuration.product.amount_fen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN
  ) {
    add("PRODUCT_AMOUNT", "年度品牌权益价格不得低于 1.00 元", "/platform/branding-addon");
  }

  const production = configuration.virtual_products.find(
    (candidate) => candidate.environment === "production",
  );
  const mapping = production?.mapping ?? null;
  if (!mapping) {
    add("PRODUCTION_MAPPING_REQUIRED", "请先配置生产环境虚拟商品映射", PAYMENT_SETTINGS_HREF);
  } else {
    if (mapping.status !== "active") {
      add("PRODUCTION_MAPPING_DISABLED", "请先启用生产环境虚拟商品映射", PAYMENT_SETTINGS_HREF);
    }
    if (mapping.validation_status !== "valid") {
      add("PRODUCTION_MAPPING_INVALID", "请先通过生产环境虚拟商品映射校验", PAYMENT_SETTINGS_HREF);
    }
    if (
      configuration.product.amount_fen === null ||
      mapping.expected_amount_fen !== configuration.product.amount_fen ||
      mapping.expected_amount_fen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN
    ) {
      add(
        "PRODUCTION_MAPPING_AMOUNT_MISMATCH",
        "生产环境映射价格必须与年度品牌权益价格一致",
        PAYMENT_SETTINGS_HREF,
      );
    }
    if (
      mapping.encrypted_secret_ref !== WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production ||
      !production?.secret.configured ||
      production.secret.revision !== mapping.secret_revision
    ) {
      add("PRODUCTION_MAPPING_SECRET", "生产环境 AppKey 未配置或版本不匹配", PAYMENT_SETTINGS_HREF);
    }
  }

  if (!secretStatuses.message_auth.message_token.configured) {
    add("MESSAGE_TOKEN_MISSING", "请先配置虚拟支付消息令牌", PAYMENT_SETTINGS_HREF);
  } else if (!secretStatuses.message_auth.message_token.valid) {
    add("MESSAGE_TOKEN_INVALID", "虚拟支付消息令牌格式不正确", PAYMENT_SETTINGS_HREF);
  }

  const originalId = secretStatuses.message_auth.original_id;
  if (!originalId.configured) {
    add("ORIGINAL_ID_MISSING", "请先配置小程序原始 ID", originalId.settings_href);
  } else if (!originalId.valid) {
    add("ORIGINAL_ID_INVALID", "小程序原始 ID 格式不正确，应以 gh_ 开头", originalId.settings_href);
  }

  return { ready: blockers.length === 0, blockers };
}

export function assertPlatformBrandingVirtualPaymentReady(input: {
  product: BrandingAddonProductRecord;
  production: BrandingVirtualProductRecord | null;
  productionSecretConfigured: boolean;
  secretStatuses: VirtualPaymentSecretStatuses;
}) {
  const readiness = evaluatePlatformBrandingVirtualPaymentReadiness({
    product: input.product,
    virtual_products: [{
      environment: "production",
      mapping: input.production,
      secret: {
        key: WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
        revision: input.productionSecretConfigured
          ? input.production?.secret_revision ?? null
          : null,
        configured: input.productionSecretConfigured,
      },
    }],
  }, input.secretStatuses);
  if (!readiness.ready) {
    throw Errors.business(
      409,
      "微信虚拟支付尚未就绪，请处理阻塞项后重试",
      "BRANDING_VIRTUAL_PAYMENT_NOT_READY",
      { blocker_codes: readiness.blockers.map(({ code }) => code) },
    );
  }
}

export function assertBrandingVirtualPaymentModeTransition(
  from: BrandingPurchaseMode,
  to: BrandingPurchaseMode,
) {
  if (from === to ||
    (from === "direct_legacy" && to === "maintenance") ||
    (from === "maintenance" && to === "wechat_virtual") ||
    (from === "wechat_virtual" && to === "maintenance")) return;
  throw Errors.business(
    409,
    "不支持当前商品购买模式切换",
    "BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID",
  );
}
import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
