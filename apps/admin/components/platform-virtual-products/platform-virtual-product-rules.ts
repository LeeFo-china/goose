import type {
  VirtualBenefitType,
  VirtualPaymentEnvironment,
  VirtualProductStatus,
} from "@gooes/domain";

import type {
  PlatformVirtualProductDetailData,
  PlatformVirtualProductGrantRule,
  PlatformVirtualProductListItem,
  VirtualGoodsState,
  VirtualProductValidationStatus,
} from "./platform-virtual-product-types";

export const virtualProductTypeOptions: ReadonlyArray<{
  value: VirtualBenefitType;
  label: string;
}> = [
  { value: "duration", label: "时效权益" },
  { value: "count", label: "次数包" },
  { value: "points", label: "积分包" },
  { value: "quota", label: "额度包" },
];

export const virtualProductStatusOptions: ReadonlyArray<{
  value: VirtualProductStatus;
  label: string;
}> = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "已启用" },
  { value: "suspended", label: "已暂停" },
  { value: "archived", label: "已归档" },
];

export const virtualEnvironmentLabels: Record<VirtualPaymentEnvironment, string> = {
  sandbox: "沙箱环境",
  production: "生产环境",
};

export const durationUnitLabels = {
  month: "个月",
  year: "年",
} as const;

export const refundTemplateLabels = {
  duration_before_fulfillment: "履约前按时效权益退款",
  consumable_unused_full_reverse: "未消耗权益全额冲销",
} as const;

export const productStatusMeta: Record<
  VirtualProductStatus,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  draft: { label: "草稿", variant: "secondary" },
  active: { label: "已启用", variant: "success" },
  suspended: { label: "已暂停", variant: "warning" },
  archived: { label: "已归档", variant: "danger" },
};

export const validationStatusMeta: Record<
  VirtualProductValidationStatus,
  { label: string; variant: "secondary" | "success" | "danger" }
> = {
  pending: { label: "待校验", variant: "secondary" },
  valid: { label: "校验通过", variant: "success" },
  invalid: { label: "校验失败", variant: "danger" },
};

export const goodsStateMeta: Record<
  VirtualGoodsState,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  not_started: { label: "未开始", variant: "secondary" },
  processing: { label: "处理中", variant: "warning" },
  succeeded: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  unknown: { label: "未知", variant: "warning" },
  out_of_sync: { label: "需重传", variant: "danger" },
};

export function formatFen(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "未设置";
  return `¥${((value ?? 0) / 100).toFixed(2)}`;
}

export function formatVirtualProductDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function getProductTypeLabel(type: VirtualBenefitType) {
  return virtualProductTypeOptions.find((item) => item.value === type)?.label ?? type;
}

export function getGrantRule(product: PlatformVirtualProductDetailData) {
  const rule = product.grant_rule;
  return Array.isArray(rule) ? rule[0] ?? null : rule ?? null;
}

export function summarizeGrantRule(rule: PlatformVirtualProductGrantRule | null) {
  if (!rule) return "未配置发放规则";
  if (rule.benefit_type === "duration") {
    return `${rule.entitlement_code}，发放 ${rule.duration_value ?? "-"}${
      durationUnitLabels[rule.duration_unit ?? "month"]
    }`;
  }
  const expiry = rule.expiry_mode === "permanent"
    ? "永久有效"
    : `${rule.expiry_value ?? "-"}${durationUnitLabels[rule.expiry_unit ?? "month"]}有效`;
  return `${rule.entitlement_code}，发放 ${rule.grant_amount ?? "-"}，${expiry}`;
}

export function buildVirtualProductQuery(input: {
  page: number;
  pageSize: number;
  keyword: string;
  productType: VirtualBenefitType | "";
  status: VirtualProductStatus | "";
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.productType) query.set("product_type", input.productType);
  if (input.status) query.set("status", input.status);
  return query.toString();
}

export function getListCurrentCount(input: {
  products: PlatformVirtualProductListItem[];
  pageSize: number;
  total: number;
}) {
  return Math.min(input.products.length || input.pageSize, input.total);
}
