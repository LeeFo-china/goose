import type {
  PlatformVirtualPaymentMapping,
  PlatformVirtualPaymentChannelStatus,
  PlatformVirtualPaymentProductSummary,
  PlatformVirtualPaymentChannelPatch,
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

export type VirtualPaymentChannelDraft = {
  appId: string;
  virtualMerchantId: string;
  offerId: string;
  status: PlatformVirtualPaymentChannelStatus;
};

type BuildResult<T> =
  | { ok: true; patch: T }
  | { ok: false; message: string };

export function createVirtualChannelDraft(
  mapping: PlatformVirtualPaymentMapping | null,
): VirtualPaymentChannelDraft {
  return {
    appId: mapping?.app_id ?? "",
    virtualMerchantId: mapping?.virtual_merchant_id ?? "",
    offerId: mapping?.offer_id ?? "",
    status: mapping?.status === "active" ? "active" : "disabled",
  };
}

export function buildVirtualChannelPatch(input: {
  summary: PlatformVirtualPaymentProductSummary;
  draft: VirtualPaymentChannelDraft;
}): BuildResult<PlatformVirtualPaymentChannelPatch> {
  const appId = input.draft.appId.trim();
  const virtualMerchantId = input.draft.virtualMerchantId.trim();
  const offerId = input.draft.offerId.trim();
  if (!appId || !virtualMerchantId || !offerId) {
    return { ok: false, message: "请完整填写当前环境的虚拟支付渠道配置" };
  }
  const current = input.summary.mapping;
  const secretRevision = input.summary.secret.revision ?? current?.secret_revision;
  if (!current || !current.version) {
    return { ok: false, message: "当前环境渠道配置尚未初始化" };
  }
  if (!secretRevision) {
    return { ok: false, message: "请先配置当前环境的虚拟支付 AppKey" };
  }
  if (input.draft.status === "active" && !input.summary.secret.configured) {
    return { ok: false, message: "请先配置当前环境的虚拟支付 AppKey" };
  }

  return {
    ok: true,
    patch: {
      app_id: appId,
      virtual_merchant_id: virtualMerchantId,
      offer_id: offerId,
      secret_revision: secretRevision,
      status: input.draft.status === "active" ? "active" : "disabled",
      version: current.version,
    },
  };
}

export function buildVirtualPaymentSettingsPatch(input: {
  currentMode: BrandingPurchaseMode;
  nextMode: BrandingPurchaseMode;
  version: number;
}): BuildResult<PlatformVirtualPaymentSettingsPatch> {
  const transitionError = getModeTransitionError(
    input.currentMode,
    input.nextMode,
  );
  if (transitionError) return { ok: false, message: transitionError };

  const modeChanged = input.currentMode !== input.nextMode;
  if (!modeChanged) {
    return { ok: false, message: "没有需要保存的虚拟支付配置" };
  }
  return {
    ok: true,
    patch: {
      version: input.version,
      ...(modeChanged ? { purchase_mode: input.nextMode } : {}),
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
