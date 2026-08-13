import type { PlatformServiceTrialSummary } from "./platform-service-trial-types";

const TRIAL_READ_PERMISSION = "platform.service_trial.read";
const TRIAL_MANAGE_PERMISSION = "platform.service_trial.manage";
const TRIAL_OVERRIDE_PERMISSION = "platform.service_trial.override";

type PlatformServiceTrialPermissionInput = {
  tenantId: string | null;
  roles: readonly string[];
  permissionCodes: readonly string[];
  isPlatformStaff?: boolean;
  isPlatformSuperAdmin?: boolean;
};

export function buildServiceTrialQuery(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  source?: string;
  trialType?: string;
  assigneeEmployeeId?: string;
  appliedFrom?: string;
  appliedTo?: string;
  expiresFrom?: string;
  expiresTo?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  setQueryValue(query, "keyword", input.keyword);
  setQueryValue(query, "status", input.status);
  setQueryValue(query, "source", input.source);
  setQueryValue(query, "trialType", input.trialType);
  setQueryValue(query, "assigneeEmployeeId", input.assigneeEmployeeId);
  setQueryValue(query, "appliedFrom", toDateBoundary(input.appliedFrom, "start"));
  setQueryValue(query, "appliedTo", toDateBoundary(input.appliedTo, "end"));
  setQueryValue(query, "expiresFrom", toDateBoundary(input.expiresFrom, "start"));
  setQueryValue(query, "expiresTo", toDateBoundary(input.expiresTo, "end"));
  return query.toString();
}

export function buildPlatformServiceTrialTabQuery(pageSize: number) {
  return new URLSearchParams({
    tab: "trials",
    trialPageSize: String(pageSize),
  }).toString();
}

export function emptyPlatformServiceTrialSummary(): PlatformServiceTrialSummary {
  return {
    pending_review_count: 0,
    scheduled_count: 0,
    current_active_count: 0,
    expiring_within_7_days_count: 0,
    month_new_count: 0,
    month_approved_count: 0,
    month_converted_count: 0,
    application_approval_rate: 0,
    activated_cohort_conversion_rate: 0,
    server_time: new Date(0).toISOString(),
  };
}

export function normalizeTrialAssigneeFilterValue(value?: string): string | undefined {
  if (!value) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value)
    ? value
    : undefined;
}

export function buildTrialAssigneeFilterCandidatePath(value?: string): string | null {
  const includeEmployeeId = normalizeTrialAssigneeFilterValue(value);
  if (!includeEmployeeId) return null;
  const query = new URLSearchParams({
    page: "1",
    pageSize: "20",
    includeEmployeeId,
  });
  return `/platform/billing/service-trials/assignee-candidates?${query.toString()}`;
}

export function getPlatformServiceTrialPermissions({
  tenantId,
  roles,
  permissionCodes,
  isPlatformStaff,
  isPlatformSuperAdmin,
}: PlatformServiceTrialPermissionInput) {
  const isSuperAdmin = isPlatformSuperAdmin === true;
  const isPlatformActor = tenantId === null && (
    isSuperAdmin
    || isPlatformStaff === true
    || roles.includes("platform_admin")
    || roles.includes("platform_staff")
  );
  const permissions = new Set(permissionCodes);
  const hasPermission = (code: string) => isSuperAdmin || permissions.has(code);

  return {
    canRead: isPlatformActor && hasPermission(TRIAL_READ_PERMISSION),
    canGrant: isPlatformActor && hasPermission(TRIAL_MANAGE_PERMISSION),
    canUpdatePolicy: isPlatformActor
      && hasPermission(TRIAL_MANAGE_PERMISSION)
      && hasPermission(TRIAL_OVERRIDE_PERMISSION),
  };
}

function setQueryValue(query: URLSearchParams, key: string, value?: string) {
  if (value) query.set(key, value);
}

function toDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) return undefined;
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
