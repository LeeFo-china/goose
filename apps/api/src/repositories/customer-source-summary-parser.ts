export type CustomerSourceRawRecord = {
  id: string;
  tenant_id: string;
  customer_id: string;
  source: string;
  source_label: string | null;
  platform_lead_id: string | null;
  assigned_by_employee_id: string | null;
  assigned_at: string | null;
  metadata: unknown;
  created_at: string;
  source_employee_id: string | null;
  related_type: string | null;
  related_id: string | null;
  share_link_id: string | null;
  marketing_lead_id: string | null;
  douyin_measurement_appointment_id: string | null;
};

export type CustomerSourceSummaryRecord = {
  customerId: string;
  total: number;
  latestSource: CustomerSourceRawRecord | null;
  hasOldCustomerNewLead: boolean;
  hasPlatformNewLead: boolean;
  hasEmployeeShare: boolean;
};

const SUMMARY_KEYS = [
  "customer_id",
  "total",
  "latest_source",
  "has_old_customer_new_lead",
  "has_platform_new_lead",
  "has_employee_share",
] as const;

const SOURCE_KEYS = [
  "id",
  "tenant_id",
  "customer_id",
  "source",
  "source_label",
  "platform_lead_id",
  "assigned_by_employee_id",
  "assigned_at",
  "metadata",
  "created_at",
  "source_employee_id",
  "related_type",
  "related_id",
  "share_link_id",
  "marketing_lead_id",
  "douyin_measurement_appointment_id",
] as const;

export function parseCustomerSourceSummaryRows(
  value: unknown,
  input: { tenantId: string; customerIds: string[] },
): CustomerSourceSummaryRecord[] | null {
  if (!Array.isArray(value) || value.length !== input.customerIds.length) {
    return null;
  }

  const requested = new Set(input.customerIds);
  const seen = new Set<string>();
  const parsed: CustomerSourceSummaryRecord[] = [];

  for (const candidate of value) {
    if (!hasExactKeys(candidate, SUMMARY_KEYS)) return null;

    const customerId = candidate.customer_id;
    if (
      typeof customerId !== "string"
      || !requested.has(customerId)
      || seen.has(customerId)
      || !isSafeCount(candidate.total)
      || typeof candidate.has_old_customer_new_lead !== "boolean"
      || typeof candidate.has_platform_new_lead !== "boolean"
      || typeof candidate.has_employee_share !== "boolean"
    ) {
      return null;
    }

    const latestSource = parseLatestSource(candidate.latest_source, {
      tenantId: input.tenantId,
      customerId,
    });
    if (
      latestSource === undefined
      || (candidate.total === 0 && latestSource !== null)
      || (candidate.total > 0 && latestSource === null)
    ) {
      return null;
    }

    seen.add(customerId);
    parsed.push({
      customerId,
      total: candidate.total,
      latestSource,
      hasOldCustomerNewLead: candidate.has_old_customer_new_lead,
      hasPlatformNewLead: candidate.has_platform_new_lead,
      hasEmployeeShare: candidate.has_employee_share,
    });
  }

  return seen.size === requested.size ? parsed : null;
}

function parseLatestSource(
  value: unknown,
  scope: { tenantId: string; customerId: string },
): CustomerSourceRawRecord | null | undefined {
  if (value === null) return null;
  if (!hasExactKeys(value, SOURCE_KEYS)) return undefined;
  if (
    !isString(value.id)
    || value.tenant_id !== scope.tenantId
    || value.customer_id !== scope.customerId
    || !isString(value.source)
    || !isNullableString(value.source_label)
    || !isNullableString(value.platform_lead_id)
    || !isNullableString(value.assigned_by_employee_id)
    || !isNullableString(value.assigned_at)
    || !isString(value.created_at)
    || !isNullableString(value.source_employee_id)
    || !isNullableString(value.related_type)
    || !isNullableString(value.related_id)
    || !isNullableString(value.share_link_id)
    || !isNullableString(value.marketing_lead_id)
    || !isNullableString(value.douyin_measurement_appointment_id)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    tenant_id: value.tenant_id,
    customer_id: value.customer_id,
    source: value.source,
    source_label: value.source_label,
    platform_lead_id: value.platform_lead_id,
    assigned_by_employee_id: value.assigned_by_employee_id,
    assigned_at: value.assigned_at,
    metadata: value.metadata,
    created_at: value.created_at,
    source_employee_id: value.source_employee_id,
    related_type: value.related_type,
    related_id: value.related_id,
    share_link_id: value.share_link_id,
    marketing_lead_id: value.marketing_lead_id,
    douyin_measurement_appointment_id: value.douyin_measurement_appointment_id,
  };
}

function hasExactKeys<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key as Key));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}
