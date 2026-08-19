import { describe, expect, mock, test } from "bun:test";

import {
  AdminTenantServiceAccessSchema,
  type EmployeeServiceAccessAction,
  type EmployeeServiceAccessSummary,
} from "@gooes/domain";

import type { TenantServiceAccessFacts } from "@/repositories/tenant-service-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const TRIAL_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-08-12T08:00:00.000Z";

describe("AdminTenantServiceAccessService", () => {
  test("keeps workspace entry and gates trial viewing by read permission", async () => {
    const allowed = await resolve(workspaceSummary(), [
      "billing.service_trial.read",
    ]);
    const denied = await resolve(workspaceSummary(), []);

    expect(actionKeys(allowed)).toEqual(["enter_workspace", "view_trial"]);
    expect(actionKeys(denied)).toEqual(["enter_workspace", null]);
  });

  test("keeps grace purchase only with order create permission", async () => {
    const allowed = await resolve(graceSummary(), [
      "billing.service_order.create",
    ]);
    const denied = await resolve(graceSummary(), []);

    expect(actionKeys(allowed)).toEqual([
      "enter_readonly_workspace",
      "purchase_service",
    ]);
    expect(actionKeys(denied)).toEqual(["enter_readonly_workspace", null]);
  });

  test("preserves apply and purchase order when both are permitted", async () => {
    const result = await resolve(serviceBlockedSummary(), [
      "billing.service_trial.apply",
      "billing.service_order.create",
    ]);

    expect(actionKeys(result)).toEqual(["apply_trial", "purchase_service"]);
  });

  test("deduplicates blocked recovery actions by key in source order", async () => {
    const result = await resolve(duplicatePurchaseSummary(), [
      "billing.service_order.create",
    ]);

    expect(actionKeys(result)).toEqual([
      "purchase_service",
      "contact_tenant_admin",
    ]);
  });

  test("rejects workspace access without the required entry action", async () => {
    const invalidSummary = { ...workspaceSummary(), primary_action: null };

    expect(resolve(invalidSummary, [])).rejects.toMatchObject({
      code: "DB_ERROR",
      message: "Admin 服务访问事实不一致",
    });
  });

  test("rejects grace access without the required readonly entry action", async () => {
    const invalidSummary = { ...graceSummary(), primary_action: null };

    expect(resolve(invalidSummary, [])).rejects.toMatchObject({
      code: "DB_ERROR",
      message: "Admin 服务访问事实不一致",
    });
  });

  test("uses trial view plus tenant admin when expired user can only read", async () => {
    const result = await resolve(expiredSummary(), [
      "billing.service_trial.read",
    ]);

    expect(actionKeys(result)).toEqual([
      "view_trial",
      "contact_tenant_admin",
    ]);
  });

  test("order read does not grant purchase and falls back to tenant admin", async () => {
    const result = await resolve(serviceBlockedWithRefreshSummary(), [
      "billing.service_order.read",
    ]);

    expect(actionKeys(result)).toEqual(["contact_tenant_admin", "refresh"]);
  });

  test("uses tenant admin fallback when no recovery permission is granted", async () => {
    const result = await resolve(serviceBlockedSummary(), []);

    expect(actionKeys(result)).toEqual(["contact_tenant_admin", "refresh"]);
    expect(JSON.stringify(result)).not.toContain("apply_trial");
    expect(JSON.stringify(result)).not.toContain("purchase_service");
  });

  test("hard blocked always exposes only platform contact and refresh", async () => {
    const result = await resolve(hardBlockedSummary(), [
      "billing.service_trial.apply",
      "billing.service_trial.read",
      "billing.service_order.create",
    ]);

    expect(actionKeys(result)).toEqual(["contact_platform", "refresh"]);
  });

  test("calls resolver once and passes tenant and permissions unchanged", async () => {
    const { AdminTenantServiceAccessService } = await import(
      "./admin-tenant-service-access"
    );
    const permissionCodes = ["billing.service_trial.read"] as const;
    const resolveEmployeeAccess = mock(async () => workspaceSummary());
    const service = new AdminTenantServiceAccessService({
      resolveEmployeeAccess,
    });

    await service.resolve({ tenantId: TENANT_ID, permissionCodes });

    expect(resolveEmployeeAccess).toHaveBeenCalledTimes(1);
    expect(resolveEmployeeAccess).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      permissionCodes,
    });
  });

  test("projects a real employee service summary from a fake repository", async () => {
    const { AdminTenantServiceAccessService } = await import(
      "./admin-tenant-service-access"
    );
    const { EmployeeServiceAccessService } = await import(
      "./employee-service-access"
    );
    const facts: TenantServiceAccessFacts = {
      evaluatedAt: NOW,
      tenantStatus: "active",
      contract: null,
      paidOnboardingOrder: null,
      legacySubscriptionStatus: "locked",
      currentTrial: null,
      latestTrial: null,
    };
    const employeeService = new EmployeeServiceAccessService({
      repository: { getAccessFacts: async () => facts },
      trialAccessEnabled: async () => true,
      trialApplicationEnabled: async () => true,
    });
    const service = new AdminTenantServiceAccessService({
      resolveEmployeeAccess: (input) => employeeService.resolve(input),
    });

    const result = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: [
        "billing.service_trial.apply",
        "billing.service_order.create",
      ],
    });

    expect(result.accessStatus).toBe("service_blocked");
    expect(actionKeys(result)).toEqual(["apply_trial", "purchase_service"]);
  });

  test("maps every fact, satisfies schema, and strips mini-program paths", async () => {
    const summary = workspaceSummary();
    const result = await resolve(summary, ["billing.service_trial.read"]);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      accessStatus: summary.access_status,
      accessMode: summary.access_mode,
      accessLevel: summary.access_level,
      canEnterWorkspace: summary.can_enter_workspace,
      readonly: summary.readonly,
      trialId: summary.trial_id,
      trialStatus: summary.trial_status,
      startsAt: summary.starts_at,
      endsAt: summary.ends_at,
      evaluatedAt: summary.evaluated_at,
      title: summary.title,
      message: summary.message,
    });
    expect(AdminTenantServiceAccessSchema.safeParse(result).success).toBe(true);
    expect(serialized).not.toContain("path");
    expect(serialized).not.toContain("/packageEmployees/");
    expect(serialized).not.toContain("/pages/");
  });

  test("throws DB_ERROR when employee facts violate the admin contract", async () => {
    const { AdminTenantServiceAccessService } = await import(
      "./admin-tenant-service-access"
    );
    const invalidSummary = { ...workspaceSummary(), title: "" };
    const service = new AdminTenantServiceAccessService({
      resolveEmployeeAccess: async () => invalidSummary,
    });

    expect(service.resolve({ tenantId: TENANT_ID, permissionCodes: [] }))
      .rejects.toMatchObject({
        code: "DB_ERROR",
        message: "Admin 服务访问事实不一致",
      });
  });
});

async function resolve(
  summary: EmployeeServiceAccessSummary,
  permissionCodes: readonly string[],
) {
  const { AdminTenantServiceAccessService } = await import(
    "./admin-tenant-service-access"
  );
  const service = new AdminTenantServiceAccessService({
    resolveEmployeeAccess: async () => summary,
  });
  return service.resolve({ tenantId: TENANT_ID, permissionCodes });
}

function actionKeys(result: {
  primaryAction: { key: string } | null;
  secondaryAction: { key: string } | null;
}) {
  return [result.primaryAction?.key ?? null, result.secondaryAction?.key ?? null];
}

function workspaceSummary(): EmployeeServiceAccessSummary {
  return summary({
    access_mode: "trial",
    access_level: "read_write",
    access_status: "workspace_available",
    can_enter_workspace: true,
    trial_status: "active",
    primary_action: action("enter_workspace", "进入工作台", "/pages/index/index"),
    secondary_action: action(
      "view_trial",
      "查看试用",
      `/packageEmployees/pages/platformServiceTrialDetail/index?id=${TRIAL_ID}`,
    ),
  });
}

function graceSummary(): EmployeeServiceAccessSummary {
  return summary({
    access_mode: "grace",
    access_level: "read_only",
    access_status: "grace_period",
    can_enter_workspace: true,
    readonly: true,
    trial_status: "grace_period",
    primary_action: action(
      "enter_readonly_workspace",
      "只读进入工作台",
      "/pages/index/index",
    ),
    secondary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
  });
}

function serviceBlockedSummary(): EmployeeServiceAccessSummary {
  return summary({
    primary_action: action(
      "apply_trial",
      "申请试用",
      "/packageEmployees/pages/platformServiceTrialApply/index",
    ),
    secondary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
  });
}

function serviceBlockedWithRefreshSummary(): EmployeeServiceAccessSummary {
  return summary({
    primary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
    secondary_action: action("refresh", "刷新状态", null),
  });
}

function duplicatePurchaseSummary(): EmployeeServiceAccessSummary {
  return summary({
    primary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
    secondary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
  });
}

function expiredSummary(): EmployeeServiceAccessSummary {
  return summary({
    access_status: "expired",
    trial_status: "expired",
    primary_action: action(
      "purchase_service",
      "购买正式服务",
      "/packageEmployees/pages/platformServicePaymentSmoke/index",
    ),
    secondary_action: action(
      "view_trial",
      "查看试用",
      `/packageEmployees/pages/platformServiceTrialDetail/index?id=${TRIAL_ID}`,
    ),
  });
}

function hardBlockedSummary(): EmployeeServiceAccessSummary {
  return summary({
    access_mode: "hard_blocked",
    access_status: "hard_blocked",
    trial_id: null,
    trial_status: null,
    primary_action: action("contact_platform", "联系平台", null),
    secondary_action: action("refresh", "刷新状态", null),
  });
}

function summary(
  overrides: Partial<EmployeeServiceAccessSummary>,
): EmployeeServiceAccessSummary {
  return {
    access_mode: "service_blocked",
    access_level: "none",
    access_status: "service_blocked",
    can_enter_workspace: false,
    readonly: false,
    trial_id: TRIAL_ID,
    trial_status: "rejected",
    starts_at: "2026-08-01T00:00:00.000Z",
    ends_at: "2026-08-31T00:00:00.000Z",
    evaluated_at: NOW,
    title: "平台技术服务状态",
    message: "请根据当前状态执行可用操作。",
    primary_action: null,
    secondary_action: null,
    ...overrides,
  };
}

function action(
  key: EmployeeServiceAccessAction["key"],
  label: string,
  path: string | null,
): EmployeeServiceAccessAction {
  return { key, label, path };
}
