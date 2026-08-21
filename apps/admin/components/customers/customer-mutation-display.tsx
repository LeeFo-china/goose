"use client";

import { CustomerStatusConfig, isCustomerStatus } from "@gooes/domain";
import { FormSelect } from "@/components/admin/form-select";
import { Badge } from "@/components/ui/badge";
import type { BadgeVariant, CustomerRecord, CustomerSourceRecord, Owner, PropertySummary } from "@/components/customers/customer-mutation-types";
import { CustomerWorkflowActionConfig } from "@/components/workflows/workflow-business-actions";

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function SelectField({
  id,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormSelect
      id={id}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      options={options.map(([optionValue, label]) => ({
        value: optionValue,
        label,
      }))}
      onChange={onChange}
    />
  );
}

export function ownerName(value: Owner | Owner[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getSourceBadges(customer: Pick<CustomerRecord, "has_old_customer_new_lead" | "has_platform_new_lead" | "has_employee_share">) {
  return [
    customer.has_old_customer_new_lead
      ? { key: "old_customer_new_lead", label: "老客户新线索", variant: "warning" as const }
      : null,
    customer.has_platform_new_lead
      ? { key: "platform_new_lead", label: "平台新线索", variant: "default" as const }
      : null,
    customer.has_employee_share
      ? { key: "employee_share", label: "员工分享", variant: "secondary" as const }
      : null,
  ].filter((item): item is { key: string; label: string; variant: "warning" | "default" | "secondary" } => Boolean(item));
}

export function SourceTags({ customer }: { customer: CustomerRecord }) {
  const badges = getSourceBadges(customer);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge.key} variant={badge.variant}>{badge.label}</Badge>
      ))}
    </div>
  );
}

export function sourceActorName(source: CustomerSourceRecord) {
  return source.source_employee?.name
    || source.assigned_by?.name
    || source.source_employee?.phone_masked
    || source.assigned_by?.phone_masked
    || "-";
}

export function statusVariant(type: string | null | undefined): BadgeVariant {
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "danger") return "danger";
  if (type === "primary") return "default";
  return "secondary";
}

export function customerStatusLabel(status: string | null | undefined) {
  return isCustomerStatus(status) ? CustomerStatusConfig[status].label : status || "-";
}

export function customerStatusBadgeVariant(status: string | null | undefined) {
  return isCustomerStatus(status)
    ? statusVariant(CustomerStatusConfig[status].type)
    : "outline";
}

export function customerActionLabel(action: string) {
  return action in CustomerWorkflowActionConfig
    ? CustomerWorkflowActionConfig[action as keyof typeof CustomerWorkflowActionConfig].label
    : action;
}

export function formatPropertySummary(property?: PropertySummary | null) {
  if (!property) return "";
  return [property.community, property.building_info].filter(Boolean).join(" ");
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
