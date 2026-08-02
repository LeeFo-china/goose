import {
  parseYuanInputToFen,
} from "@/components/branding-addon/platform-branding-addon-product-form-data";
import type {
  PlatformVirtualPaymentMapping,
  PlatformVirtualPaymentMappingPatch,
  PlatformVirtualPaymentMappingStatus,
  PlatformVirtualPaymentProductSummary,
  PlatformVirtualPaymentSettingsPatch,
} from "@/components/settings/platform-virtual-payment-settings-types";
import type {
  BrandingPurchaseMode,
  BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

export const virtualPaymentModeLabels: Record<BrandingPurchaseMode, string> = {
  direct_legacy: "普通支付（保留）",
  maintenance: "维护模式",
  wechat_virtual: "微信虚拟支付",
};

export const virtualPaymentEnvironmentLabels: Record<
  BrandingVirtualPaymentEnvironment,
  string
> = {
  sandbox: "沙箱环境",
  production: "生产环境",
};

export type VirtualPaymentMappingDraft = {
  appId: string;
  virtualMerchantId: string;
  offerId: string;
  providerProductId: string;
  itemUrl: string;
  status: PlatformVirtualPaymentMappingStatus;
};

type BuildResult<T> =
  | { ok: true; patch: T }
  | { ok: false; message: string };

export const parseVirtualPaymentAmountInput = parseYuanInputToFen;

export function createVirtualMappingDraft(
  mapping: PlatformVirtualPaymentMapping | null,
): VirtualPaymentMappingDraft {
  return {
    appId: mapping?.app_id ?? "",
    virtualMerchantId: mapping?.virtual_merchant_id ?? "",
    offerId: mapping?.offer_id ?? "",
    providerProductId: mapping?.provider_product_id ?? "",
    itemUrl: mapping?.item_url ?? "",
    status: mapping?.status ?? "draft",
  };
}

export function buildVirtualMappingPatch(input: {
  summary: PlatformVirtualPaymentProductSummary;
  draft: VirtualPaymentMappingDraft;
  amountYuan: string;
}): BuildResult<PlatformVirtualPaymentMappingPatch> {
  const appId = input.draft.appId.trim();
  const virtualMerchantId = input.draft.virtualMerchantId.trim();
  const offerId = input.draft.offerId.trim();
  const providerProductId = input.draft.providerProductId.trim();
  if (!appId || !virtualMerchantId || !offerId || !providerProductId) {
    return { ok: false, message: "请完整填写当前环境的虚拟商品映射" };
  }
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(providerProductId)) {
    return {
      ok: false,
      message: "渠道商品 ID 只能包含字母、数字、下划线或短横线，且不超过 20 个字符",
    };
  }
  const itemUrl = normalizeVirtualGoodsImageUrl(input.draft.itemUrl);
  if (!itemUrl) {
    return {
      ok: false,
      message: "商品图片必须是稳定的 HTTPS JPG 或 PNG 地址",
    };
  }

  const revision = input.summary.secret.revision;
  if (!input.summary.secret.configured || !revision) {
    return { ok: false, message: "请先配置当前环境的虚拟支付密钥" };
  }

  const amount = parseVirtualPaymentAmountInput(input.amountYuan);
  if (!amount.ok) return amount;
  if (input.summary.environment === "production" && amount.amountFen < 100) {
    return { ok: false, message: "生产虚拟商品价格不得低于 1.00 元" };
  }

  const current = input.summary.mapping;
  const sensitiveChanged = !current ||
    current.app_id !== appId ||
    current.virtual_merchant_id !== virtualMerchantId ||
    current.offer_id !== offerId ||
    current.provider_product_id !== providerProductId ||
    current.item_url !== itemUrl ||
    current.expected_amount_fen !== amount.amountFen ||
    current.secret_revision !== revision;
  if (
    input.draft.status === "active" &&
    !sensitiveChanged &&
    current?.validation_status !== "valid"
  ) {
    return { ok: false, message: "请先校验当前环境的虚拟商品映射" };
  }

  return {
    ok: true,
    patch: {
      environment: input.summary.environment,
      app_id: appId,
      virtual_merchant_id: virtualMerchantId,
      offer_id: offerId,
      provider_product_id: providerProductId,
      item_url: itemUrl,
      expected_amount_fen: amount.amountFen,
      secret_revision: revision,
      status: input.draft.status === "active" && sensitiveChanged
        ? "draft"
        : input.draft.status,
      version: current?.version ?? 1,
    },
  };
}

export function normalizeVirtualGoodsImageUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" &&
        /\.(?:png|jpe?g)$/i.test(url.pathname) &&
        url.username === "" && url.password === "" && url.hash === ""
      ? normalized
      : null;
  } catch {
    return null;
  }
}

export function buildVirtualPaymentSettingsPatch(input: {
  currentMode: BrandingPurchaseMode;
  nextMode: BrandingPurchaseMode;
  version: number;
  virtualProduct?: PlatformVirtualPaymentMappingPatch;
}): BuildResult<PlatformVirtualPaymentSettingsPatch> {
  const transitionError = getModeTransitionError(
    input.currentMode,
    input.nextMode,
  );
  if (transitionError) return { ok: false, message: transitionError };

  const modeChanged = input.currentMode !== input.nextMode;
  if (!modeChanged && !input.virtualProduct) {
    return { ok: false, message: "没有需要保存的虚拟支付配置" };
  }
  return {
    ok: true,
    patch: {
      version: input.version,
      ...(modeChanged ? { purchase_mode: input.nextMode } : {}),
      ...(input.virtualProduct
        ? { virtual_product: input.virtualProduct }
        : {}),
    },
  };
}

function getModeTransitionError(
  current: BrandingPurchaseMode,
  next: BrandingPurchaseMode,
): string | null {
  if (current === next) return null;
  if (current === "direct_legacy" && next === "wechat_virtual") {
    return "请先切换到维护模式并收敛旧待支付订单";
  }
  if (current === "wechat_virtual" && next === "direct_legacy") {
    return "虚拟支付启用后只能暂停，不能回退到普通支付";
  }
  if (
    (current === "direct_legacy" && next === "maintenance") ||
    (current === "maintenance" && next === "wechat_virtual") ||
    (current === "wechat_virtual" && next === "maintenance")
  ) return null;
  return "不支持当前支付通道切换";
}
