import type {
  PlatformServiceProductListItem,
  PlatformServiceProductStatus,
} from "./platform-service-product-types";

export const platformServiceProductStatusMeta: Record<
  PlatformServiceProductStatus,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  draft: { label: "草稿", variant: "secondary" },
  enabled: { label: "已上架", variant: "success" },
  disabled: { label: "已下架", variant: "warning" },
  archived: { label: "已归档", variant: "danger" },
};

export function getProductStatusMeta(status: string) {
  return platformServiceProductStatusMeta[
    status as PlatformServiceProductStatus
  ] ?? { label: status, variant: "secondary" as const };
}

export function formatFen(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "未设置";
  return `¥${((value ?? 0) / 100).toFixed(2)}`;
}

export function formatDiscount(value: number | null | undefined) {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return "未设置";
  }
  if (value >= 10_000) return "原价";
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")} 折`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function buildPlatformServiceProductQuery(input: {
  page: number;
  pageSize: number;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  return query.toString();
}

export function getListCurrentCount(input: {
  products: PlatformServiceProductListItem[];
  pageSize: number;
  total: number;
}) {
  return Math.min(input.products.length || input.pageSize, input.total);
}
