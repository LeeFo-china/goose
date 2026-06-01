"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { CUSTOMER_SOURCE_VALUES, CustomerSourceConfig, isCustomerSource } from "@gooes/domain";
import type { CustomerRecord, EmployeeOption } from "@/components/customers/customer-mutation-types";
import {
  relationOne,
} from "@/components/customers/customer-mutation-display";
import { requestCustomer } from "@/components/customers/customer-mutation-api";

export {
  buildAvatarPreviewUrl,
  requestCustomer,
  syncProjectPrimaryMember,
  syncProjectPrimaryMembers,
  uploadCustomerAvatar,
  uploadCustomerAvatarDirect,
} from "@/components/customers/customer-mutation-api";
export {
  customerActionLabel,
  customerStatusBadgeVariant,
  customerStatusLabel,
  formatDate,
  formatDateTime,
  formatPropertySummary,
  getSourceBadges,
  InfoItem,
  ownerName,
  relationOne,
  SelectField,
  sourceActorName,
  SourceTags,
  statusVariant,
} from "@/components/customers/customer-mutation-display";

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

export function isCustomerSourceValue(value: string | null | undefined): value is CustomerFormValues["source"] {
  return isCustomerSource(value);
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
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
