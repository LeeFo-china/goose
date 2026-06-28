import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BrainCircuit, Landmark, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Pagination } from "@/components/billing/billing-types";
import { buildQuery, type BillingTab, type QueryValue } from "@/app/(console)/platform/billing/billing-page-data";

export * from "@/app/(console)/platform/billing/billing-page-data";

export function formatCredits(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function directionLabel(direction: string) {
  const labels: Record<string, string> = {
    in: "入账",
    out: "扣费",
    freeze: "冻结",
    unfreeze: "解冻",
  };
  return labels[direction] || direction;
}

export function scopeLabel(scope: string) {
  return scope === "tenant_override" ? "租户定制价" : "平台默认价";
}

export function eventStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待处理",
    estimated: "已试算",
    charged: "已扣费",
    waived: "已免除",
    refunded: "已退回",
    failed: "异常",
  };
  return labels[status] || status;
}

export function readinessLabel(ready: boolean) {
  return ready ? "样本达标" : "继续观察";
}

export function readinessReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    sample_insufficient: "样本不足",
    usage_missing: "缺 token",
    pricing_rule_missing: "缺价格规则",
    credit_p95_zero: "P95 为 0",
  };
  return labels[reason] || reason;
}

export function SectionHeader({
  title,
  description,
  badge,
  badgeVariant = "outline",
  action,
}: {
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: ComponentProps<typeof Badge>["variant"];
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-normal">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
        {action}
      </div>
    </div>
  );
}

export function PaginationLinks({
  pagination,
  pageKey,
  tab,
  filters,
}: {
  pagination: Pagination;
  pageKey: "page" | "ledgerPage" | "rulePage" | "eventPage";
  tab: BillingTab;
  filters?: Record<string, QueryValue>;
}) {
  const prevPage = Math.max(1, pagination.page - 1);
  const nextPage = pagination.page + 1;

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>共 {pagination.total} 条</span>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline" disabled={pagination.page <= 1}>
          <Link href={`/platform/billing?${buildQuery({ ...filters, tab, [pageKey]: prevPage })}`}>上一页</Link>
        </Button>
        <span>{pagination.page} / {Math.max(1, pagination.totalPages)}</span>
        <Button asChild size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}>
          <Link href={`/platform/billing?${buildQuery({ ...filters, tab, [pageKey]: nextPage })}`}>下一页</Link>
        </Button>
      </div>
    </div>
  );
}

export function FilterPanel({
  tab,
  children,
}: {
  tab: BillingTab;
  children: ReactNode;
}) {
  return (
    <form action="/platform/billing" className="border-b bg-muted/20 p-3">
      <input type="hidden" name="tab" value={tab} />
      <div className="flex flex-wrap items-end gap-3">
        <FieldGroup className="contents">{children}</FieldGroup>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/platform/billing?${buildQuery({ tab })}`}>
              <RotateCcw data-icon="inline-start" />
              重置
            </Link>
          </Button>
          <Button type="submit">
            <SlidersHorizontal data-icon="inline-start" />
            筛选
          </Button>
        </div>
      </div>
    </form>
  );
}

export function FilterInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  labelVisibility = "visible",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: "text" | "date" | "number";
  labelVisibility?: "visible" | "srOnly";
}) {
  return (
    <Field className="min-w-[12rem] flex-1 md:flex-none md:basis-60">
      <FieldLabel
        htmlFor={name}
        className={labelVisibility === "srOnly" ? "sr-only" : undefined}
      >
        {label}
      </FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue || ""}
        placeholder={placeholder}
        className="h-9"
      />
    </Field>
  );
}

export function AiStatItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <BrainCircuit className="size-4" />
      </div>
      <div className="mt-2 text-lg font-semibold tracking-normal">{value}</div>
    </div>
  );
}

export function SummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}
