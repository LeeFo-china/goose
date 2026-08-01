import Link from "next/link";
import { Settings2 } from "lucide-react";

import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingPaymentReadiness,
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
  readiness,
}: {
  product: PlatformBrandingAddonProduct;
  summaries: PlatformBrandingVirtualProductSummary[];
  readiness: PlatformBrandingPaymentReadiness | null;
}) {
  const readinessPresentation = getPaymentReadinessPresentation(readiness);
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

      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">生产就绪与阻塞情况</span>
          <Badge variant={readinessPresentation.variant}>
            {readinessPresentation.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {readinessPresentation.description}
        </p>
        {readinessPresentation.blockers.length ? (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {readinessPresentation.blockers.map((message) => (
              <li key={message} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ENVIRONMENTS.map(({ value, label }) => {
          const summary = summaries.find((item) => item.environment === value) ??
            emptySummary(value);
          return (
            <div
              key={value}
              className="flex min-w-0 flex-col gap-3 rounded-md border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">{label}</h3>
                <Badge variant="outline">配置事实</Badge>
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

export function getPaymentReadinessPresentation(
  readiness: PlatformBrandingPaymentReadiness | null,
): {
  variant: "success" | "warning";
  label: string;
  description: string;
  blockers: string[];
} {
  if (!readiness) {
    return {
      variant: "warning",
      label: "状态未确认",
      description: "完整状态请到支付配置查看",
      blockers: [],
    };
  }
  if (readiness.ready) {
    return {
      variant: "success",
      label: "服务端判定已就绪",
      description: "生产环境与消息鉴权已满足启用条件",
      blockers: [],
    };
  }
  return {
    variant: "warning",
    label: `${readiness.blockers.length} 项阻塞`,
    description: "生产环境尚未满足虚拟支付启用条件",
    blockers: readiness.blockers.map(({ message }) => message),
  };
}
