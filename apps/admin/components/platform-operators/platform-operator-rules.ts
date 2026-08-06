import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  type EmployeeStatus,
} from "@gooes/domain";

export const platformOperatorStatusOptions: ReadonlyArray<{
  value: EmployeeStatus;
  label: string;
}> = EMPLOYEE_STATUS_VALUES.map((value) => ({
  value,
  label: EmployeeStatusConfig[value].label,
}));

export const platformOperatorStatusMeta: Record<
  EmployeeStatus,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" | "outline" }
> = {
  pending: { label: EmployeeStatusConfig.pending.label, variant: "warning" },
  active: { label: EmployeeStatusConfig.active.label, variant: "success" },
  suspended: { label: EmployeeStatusConfig.suspended.label, variant: "danger" },
  leaved: { label: EmployeeStatusConfig.leaved.label, variant: "secondary" },
};

export function normalizePlatformOperatorPage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function normalizePlatformOperatorStatus(
  value: string | undefined,
): EmployeeStatus | "" {
  return EMPLOYEE_STATUS_VALUES.includes(value as EmployeeStatus)
    ? (value as EmployeeStatus)
    : "";
}

export function cleanPlatformOperatorParam(value: string | undefined) {
  return (value || "").trim().slice(0, 120);
}

export function buildPlatformOperatorQuery(input: {
  page: number;
  pageSize: number;
  keyword: string;
  status: EmployeeStatus | "";
  roleId: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  const keyword = input.keyword.trim();
  if (keyword) query.set("keyword", keyword);
  if (input.status) query.set("status", input.status);
  if (input.roleId) query.set("roleId", input.roleId);
  return `/platform/operators?${query.toString()}`;
}

export function buildPlatformOperatorUpdatePayload(input: {
  name: string;
  phone: string;
  status: EmployeeStatus;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    status: input.status,
    expected_version: input.expectedVersion,
    idempotency_key: input.idempotencyKey,
  };
}

export function buildPlatformOperatorCreatePayload(input: {
  name: string;
  phone: string;
  status: "pending" | "active";
  roleIds: string[];
  idempotencyKey: string;
}) {
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    status: input.status,
    role_ids: input.roleIds,
    idempotency_key: input.idempotencyKey,
  };
}

export function buildPlatformOperatorRolesPayload(input: {
  roleIds: string[];
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return {
    role_ids: input.roleIds,
    expected_version: input.expectedVersion,
    idempotency_key: input.idempotencyKey,
  };
}

export function buildPlatformOperatorActionPayload(input: {
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return {
    expected_version: input.expectedVersion,
    idempotency_key: input.idempotencyKey,
  };
}

export function formatPlatformOperatorDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function getPlatformOperatorCurrentCount(input: {
  operators: readonly unknown[];
  pageSize: number;
  total: number;
}) {
  return Math.min(input.operators.length || input.pageSize, input.total);
}
