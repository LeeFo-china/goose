import type {
  PlatformBrandingVirtualProduct,
  PlatformBrandingVirtualProductPatch,
  PlatformBrandingVirtualProductStatus,
  PlatformBrandingVirtualProductSummary,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

export type MappingDraft = {
  appId: string;
  virtualMerchantId: string;
  offerId: string;
  providerProductId: string;
  status: PlatformBrandingVirtualProductStatus;
};

export const modeLabels: Record<BrandingPurchaseMode, string> = {
  direct_legacy: "普通支付（保留）",
  maintenance: "维护模式",
  wechat_virtual: "微信虚拟支付",
};

export const environmentLabels: Record<
  BrandingVirtualPaymentEnvironment,
  string
> = {
  sandbox: "沙箱环境",
  production: "生产环境",
};

export function createDraft(
  mapping: PlatformBrandingVirtualProduct | null,
): MappingDraft {
  return {
    appId: mapping?.app_id ?? "",
    virtualMerchantId: mapping?.virtual_merchant_id ?? "",
    offerId: mapping?.offer_id ?? "",
    providerProductId: mapping?.provider_product_id ?? "",
    status: mapping?.status ?? "draft",
  };
}

export function createDrafts(
  summaries: PlatformBrandingVirtualProductSummary[],
) {
  return {
    sandbox: createDraft(
      summaries.find((summary) => summary.environment === "sandbox")?.mapping ??
        null,
    ),
    production: createDraft(
      summaries.find((summary) => summary.environment === "production")
        ?.mapping ?? null,
    ),
  };
}

export function emptySummary(
  environment: BrandingVirtualPaymentEnvironment,
): PlatformBrandingVirtualProductSummary {
  return {
    environment,
    mapping: null,
    secret: { key: "", revision: null, configured: false },
  };
}

export function buildMappingPatch(input: {
  environment: BrandingVirtualPaymentEnvironment;
  draft: MappingDraft;
  summary: PlatformBrandingVirtualProductSummary;
  amountFen: number | null;
}): { ok: true; patch: PlatformBrandingVirtualProductPatch } | {
  ok: false;
  message: string;
} {
  const appId = input.draft.appId.trim();
  const virtualMerchantId = input.draft.virtualMerchantId.trim();
  const offerId = input.draft.offerId.trim();
  const providerProductId = input.draft.providerProductId.trim();
  if (!appId || !virtualMerchantId || !offerId || !providerProductId) {
    return { ok: false, message: "请完整填写当前环境的虚拟商品映射" };
  }
  if (!input.summary.secret.configured || !input.summary.secret.revision) {
    return { ok: false, message: "请先在服务端配置当前环境的虚拟支付密钥" };
  }
  if (!input.amountFen) {
    return { ok: false, message: "请先配置统一年度售价" };
  }
  const current = input.summary.mapping;
  const isSensitiveChanged = !current ||
    current.app_id !== appId ||
    current.virtual_merchant_id !== virtualMerchantId ||
    current.offer_id !== offerId ||
    current.provider_product_id !== providerProductId ||
    current.expected_amount_fen !== input.amountFen ||
    current.secret_revision !== input.summary.secret.revision;
  const status = input.draft.status === "active" && isSensitiveChanged
    ? "draft"
    : input.draft.status;
  return {
    ok: true,
    patch: {
      environment: input.environment,
      app_id: appId,
      virtual_merchant_id: virtualMerchantId,
      offer_id: offerId,
      provider_product_id: providerProductId,
      expected_amount_fen: input.amountFen,
      encrypted_secret_ref: input.environment === "production"
        ? "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE"
        : "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      secret_revision: input.summary.secret.revision,
      status,
      version: input.summary.mapping?.version ?? 1,
    },
  };
}

export function replaceMapping(
  summaries: PlatformBrandingVirtualProductSummary[],
  mapping: PlatformBrandingVirtualProduct,
) {
  return summaries.map((summary) =>
    summary.environment === mapping.environment
      ? { ...summary, mapping }
      : summary
  );
}

export function getAvailableModes(
  current: BrandingPurchaseMode,
): BrandingPurchaseMode[] {
  if (current === "direct_legacy") return ["direct_legacy", "maintenance"];
  if (current === "wechat_virtual") return ["wechat_virtual", "maintenance"];
  return ["maintenance", "wechat_virtual"];
}

export function validationLabel(
  status: PlatformBrandingVirtualProduct["validation_status"] | undefined,
) {
  if (status === "valid") return "校验通过";
  if (status === "invalid") return "校验失败";
  return "待校验";
}

export function validationVariant(
  status: PlatformBrandingVirtualProduct["validation_status"] | undefined,
): "success" | "danger" | "warning" {
  if (status === "valid") return "success";
  if (status === "invalid") return "danger";
  return "warning";
}
