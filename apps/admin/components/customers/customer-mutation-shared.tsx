"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { CUSTOMER_SOURCE_VALUES, CustomerSourceConfig, CustomerStatusActionConfig, CustomerStatusConfig, isCustomerSource, isCustomerStatus } from "@gooes/domain";
import { FormSelect } from "@/components/admin/form-select";
import { Badge } from "@/components/ui/badge";
import type { BadgeVariant, CustomerRecord, CustomerSourceRecord, EmployeeOption, Owner, PropertySummary } from "@/components/customers/customer-mutation-types";
import {
  buildUploadPreviewUrl,
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import { requestBackendJson } from "@/lib/backend-client";

export const sourceOptions = CUSTOMER_SOURCE_VALUES.map((value) => [
  value,
  CustomerSourceConfig[value].label,
] as const);

export const CustomerFormSchema = z.object({
  name: z.string().trim().min(1, "请输入客户姓名"),
  avatar: z.string(),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请输入有效手机号"),
  source: z.enum(CUSTOMER_SOURCE_VALUES),
  owner_id: z.string(),
  douyin_screenshot_images: z.string(),
  community: z.string(),
  building_info: z.string(),
  area: z.string().refine((value) => {
    if (!value.trim()) return true;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0;
  }, "请输入有效面积"),
  layout: z.string(),
});

export type CustomerFormValues = z.infer<typeof CustomerFormSchema>;

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isCustomerSourceValue(value: string | null | undefined): value is CustomerFormValues["source"] {
  return isCustomerSource(value);
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
    || source.source_employee?.phone
    || source.assigned_by?.phone
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
  return action in CustomerStatusActionConfig
    ? CustomerStatusActionConfig[action as keyof typeof CustomerStatusActionConfig].label
    : action;
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function buildAvatarPreviewUrl(value: string) {
  return buildUploadPreviewUrl(value);
}

export async function requestCustomer<T = any>(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

type ProjectPrimaryRoleCode = "designer" | "supervisor";

type ProjectMemberRecord = {
  id: string;
  employee_id: string;
  role_code: string;
  is_primary?: boolean;
  is_virtual?: boolean;
};

export async function syncProjectPrimaryMember(input: {
  projectId: string;
  roleCode: ProjectPrimaryRoleCode;
  employeeId: string | null;
}) {
  const members = await requestCustomer({
    path: `/projects/${input.projectId}/members`,
  }) as ProjectMemberRecord[];
  const roleMembers = members.filter((item) =>
    !item.is_virtual && item.role_code === input.roleCode
  );
  const primaryMembers = roleMembers.filter((item) => item.is_primary);

  if (!input.employeeId) {
    await Promise.all(primaryMembers.map((item) =>
      requestCustomer({
        path: `/projects/${input.projectId}/members/${item.id}`,
        method: "DELETE",
      })
    ));
    return;
  }

  const existing = roleMembers.find((item) => item.employee_id === input.employeeId);
  if (existing) {
    if (!existing.is_primary) {
      await requestCustomer({
        path: `/projects/${input.projectId}/members/${existing.id}`,
        method: "PATCH",
        payload: { is_primary: true },
      });
    }
    return;
  }

  await requestCustomer({
    path: `/projects/${input.projectId}/members`,
    method: "POST",
    payload: {
      employee_id: input.employeeId,
      role_code: input.roleCode,
      is_primary: true,
    },
  });
}

export async function syncProjectPrimaryMembers(input: {
  projectId: string;
  designerId: string | null;
  supervisorId: string | null;
}) {
  await syncProjectPrimaryMember({
    projectId: input.projectId,
    roleCode: "designer",
    employeeId: input.designerId,
  });
  await syncProjectPrimaryMember({
    projectId: input.projectId,
    roleCode: "supervisor",
    employeeId: input.supervisorId,
  });
}

export async function uploadCustomerAvatarDirect(file: File) {
  const uploaded = await uploadDirectToCos(file, {
      scene: "customer_avatar",
    uploadErrorLabel: "上传头像",
    missingStorageMessage: "头像上传成功但未返回图片地址",
  });

  return {
    value: uploaded.storagePath,
    previewUrl: buildAvatarPreviewUrl(uploaded.storagePath),
  };
}

export async function uploadCustomerAvatar(file: File) {
  validateUploadFile(file, {
    allowedTypes: ALLOWED_AVATAR_TYPES,
    maxSizeBytes: MAX_AVATAR_SIZE,
    typeMessage: "头像仅支持 JPG、PNG、WebP、HEIC、HEIF",
    sizeMessage: "头像图片不能超过 2MB",
  });

  return uploadCustomerAvatarDirect(file);
}

export function buildDefaults(customer?: CustomerRecord): CustomerFormValues {
  const primaryProperty = (customer?.properties || []).find((item) => item.is_primary) ||
    customer?.properties?.[0];

  return {
    name: customer?.name || "",
    avatar: customer?.avatar || "",
    phone: customer?.phone || "",
    source: isCustomerSourceValue(customer?.source) ? customer.source : "walk_in",
    owner_id: customer?.owner_id || relationOne(customer?.owner)?.id || "",
    douyin_screenshot_images: (customer?.douyin_screenshot_images || []).join("\n"),
    community: customer?.community || primaryProperty?.community || "",
    building_info: customer?.building_info || primaryProperty?.building_info || "",
    area: customer?.area != null
      ? String(customer.area)
      : primaryProperty?.area != null
        ? String(primaryProperty.area)
        : "",
    layout: customer?.layout || primaryProperty?.layout || "",
  };
}

export function getPrimaryCustomerProperty(customer: CustomerRecord) {
  return (customer.properties || []).find((item) => item.id === customer.property_id)
    || (customer.properties || []).find((item) => item.is_primary)
    || customer.properties?.[0]
    || null;
}

export function formatPropertySummary(property?: PropertySummary | null) {
  if (!property) return "";
  return [property.community, property.building_info].filter(Boolean).join(" ");
}

export function useEmployeeOptions(open: boolean, customer?: CustomerRecord) {
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    requestCustomer({ path: "/employees?page=1&pageSize=100&status=active" })
      .then((data) => {
        if (cancelled) return;
        setOptions((data?.list || []).map((item: any) => ({
          id: item.id,
          name: item.name ?? null,
          phone: item.phone ?? null,
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "负责人加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const fallback = useMemo(() => {
    const owner = relationOne(customer?.owner);
    return owner?.id ? {
      id: owner.id,
      name: owner.name ?? null,
      phone: owner.phone ?? null,
    } : null;
  }, [customer]);

  if (fallback && !options.some((item) => item.id === fallback.id)) {
    return { options: [fallback, ...options], loading, error };
  }

  return { options, loading, error };
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
