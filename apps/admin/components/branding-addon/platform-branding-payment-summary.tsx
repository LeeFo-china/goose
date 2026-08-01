import Link from "next/link";
import { Settings2 } from "lucide-react";

import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingVirtualProduct,
  PlatformBrandingVirtualProductSummary,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { virtualPaymentModeLabels } from "@/components/settings/platform-virtual-payment-settings-data";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

const ENVIRONMENTS: ReadonlyArray<{
  value: BrandingVirtualPaymentEnvironment;
  label: string;
}> = [
  { value: "sandbox", label: "沙箱环境" },
  { value: "production", label: "生产环境" },
];

export function PlatformBrandingPaymentSummary({
  product,
  summaries,
}: {
  product: PlatformBrandingAddonProduct;
  summaries: PlatformBrandingVirtualProductSummary[];
}) {
  return (
    <section
      className="flex flex-col gap-4 border-t pt-5"
      aria-labelledby="branding-payment-summary"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="branding-payment-summary" className="text-sm font-semibold">
            支付配置摘要
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            此处仅展示数字权益支付状态，配置与校验统一在支付配置中完成。
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings?group=payment&section=virtual&environment=production">
            <Settings2 data-icon="inline-start" />
            去支付配置
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-4 py-3">
        <span className="text-xs text-muted-foreground">当前购买模式</span>
        <Badge variant={modeVariant(product.purchase_mode)}>
          {virtualPaymentModeLabels[product.purchase_mode]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {modeDescription(product.purchase_mode)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ENVIRONMENTS.map(({ value, label }) => {
          const summary = summaries.find((item) => item.environment === value) ??
            emptySummary(value);
          const blockers = getBlockers(product, summary);
          return (
            <div
              key={value}
              className="flex min-w-0 flex-col gap-3 rounded-md border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">{label}</h3>
                <Badge variant={blockers.length ? "warning" : "success"}>
                  {blockers.length ? `${blockers.length} 项阻塞` : "配置就绪"}
                </Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <SummaryFact
                  label="映射状态"
                  value={mappingLabel(summary.mapping)}
                  variant={mappingVariant(summary.mapping)}
                />
                <SummaryFact
                  label="校验状态"
                  value={validationLabel(summary.mapping)}
                  variant={validationVariant(summary.mapping)}
                />
                <SummaryFact
                  label="密钥状态"
                  value={summary.secret.configured
                    ? `已配置 · v${summary.secret.revision ?? "?"}`
                    : "未配置"}
                  variant={summary.secret.configured ? "success" : "danger"}
                />
              </dl>
              <div className="flex flex-col gap-1 border-t pt-3 text-xs">
                <span className="font-medium text-foreground">阻塞项</span>
                <span
                  className={blockers.length
                    ? "text-muted-foreground"
                    : "text-success"}
                >
                  {blockers.length ? blockers.join("；") : "当前环境无阻塞项"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryFact({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: BadgeProps["variant"];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd><Badge variant={variant}>{value}</Badge></dd>
    </div>
  );
}

function getBlockers(
  product: PlatformBrandingAddonProduct,
  summary: PlatformBrandingVirtualProductSummary,
): string[] {
  const mapping = summary.mapping;
  if (!mapping) {
    return [
      "未配置商品映射",
      ...(summary.secret.configured ? [] : ["支付密钥未配置"]),
    ];
  }

  const blockers: string[] = [];
  if (mapping.status !== "active") blockers.push("商品映射未启用");
  if (mapping.validation_status !== "valid") blockers.push("商品映射未通过校验");
  if (!summary.secret.configured) blockers.push("支付密钥未配置");
  if (
    summary.secret.configured &&
    summary.secret.revision !== mapping.secret_revision
  ) blockers.push("密钥版本与映射不一致");
  if (
    product.amount_fen === null ||
    mapping.expected_amount_fen !== product.amount_fen
  ) blockers.push("映射售价与商品售价不一致");
  return blockers;
}

function emptySummary(
  environment: BrandingVirtualPaymentEnvironment,
): PlatformBrandingVirtualProductSummary {
  return {
    environment,
    mapping: null,
    secret: {
      key: environment === "production"
        ? "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE"
        : "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      revision: null,
      configured: false,
    },
  };
}

function mappingLabel(mapping: PlatformBrandingVirtualProduct | null) {
  if (!mapping) return "未配置";
  if (mapping.status === "active") return "已启用";
  if (mapping.status === "disabled") return "已停用";
  return "草稿";
}

function mappingVariant(
  mapping: PlatformBrandingVirtualProduct | null,
): BadgeProps["variant"] {
  if (mapping?.status === "active") return "success";
  if (mapping?.status === "disabled") return "danger";
  return "warning";
}

function validationLabel(mapping: PlatformBrandingVirtualProduct | null) {
  if (!mapping) return "未校验";
  if (mapping.validation_status === "valid") return "校验通过";
  if (mapping.validation_status === "invalid") return "校验失败";
  return "待校验";
}

function validationVariant(
  mapping: PlatformBrandingVirtualProduct | null,
): BadgeProps["variant"] {
  if (mapping?.validation_status === "valid") return "success";
  if (mapping?.validation_status === "invalid") return "danger";
  return "warning";
}

function modeVariant(
  mode: PlatformBrandingAddonProduct["purchase_mode"],
): BadgeProps["variant"] {
  if (mode === "wechat_virtual") return "success";
  if (mode === "maintenance") return "warning";
  return "outline";
}

function modeDescription(mode: PlatformBrandingAddonProduct["purchase_mode"]) {
  if (mode === "wechat_virtual") return "数字权益订单使用微信虚拟支付";
  if (mode === "maintenance") return "新购买已暂停";
  return "现有普通支付能力保留，后续仅用于合规交易";
}
