import { describe, expect, test } from "bun:test";

import {
  ADMIN_SERVICE_ACCESS_ACTION_VALUES,
  AdminTenantServiceAccessSchema,
} from "./admin-service-access";

const blockedSummary = {
  accessStatus: "service_blocked" as const,
  accessMode: "service_blocked" as const,
  accessLevel: "none" as const,
  canEnterWorkspace: false,
  readonly: false,
  trialId: null,
  trialStatus: null,
  startsAt: null,
  endsAt: null,
  evaluatedAt: "2026-08-19T00:00:00.000Z",
  title: "服务已停用",
  message: "请联系企业管理员恢复服务",
  primaryAction: {
    key: "contact_tenant_admin" as const,
    label: "联系企业管理员",
  },
  secondaryAction: {
    key: "refresh" as const,
    label: "刷新",
  },
};

describe("admin service access domain contract", () => {
  test("keeps admin service access actions stable", () => {
    expect(ADMIN_SERVICE_ACCESS_ACTION_VALUES).toEqual([
      "enter_workspace",
      "enter_readonly_workspace",
      "view_trial",
      "apply_trial",
      "purchase_service",
      "contact_tenant_admin",
      "contact_platform",
      "refresh",
    ]);
  });

  test("accepts a valid blocked summary", () => {
    expect(AdminTenantServiceAccessSchema.safeParse(blockedSummary).success)
      .toBe(true);
  });

  test("rejects an action containing a mini-program path", () => {
    expect(AdminTenantServiceAccessSchema.safeParse({
      ...blockedSummary,
      primaryAction: {
        key: "apply_trial",
        label: "申请试用",
        path: "/packageEmployees/pages/service-trial/index",
      },
    }).success).toBe(false);
  });

  test("rejects grace access when readonly is false", () => {
    expect(AdminTenantServiceAccessSchema.safeParse({
      ...blockedSummary,
      accessStatus: "grace_period",
      accessMode: "grace",
      accessLevel: "read_only",
      canEnterWorkspace: true,
      readonly: false,
      trialId: "0198c50e-14e8-7000-8000-000000000001",
      trialStatus: "grace_period",
    }).success).toBe(false);
  });

  test("rejects incomplete trial facts", () => {
    expect(AdminTenantServiceAccessSchema.safeParse({
      ...blockedSummary,
      trialId: "0198c50e-14e8-7000-8000-000000000001",
    }).success).toBe(false);
  });

  test("rejects workspace access with a blocked mode or read-only level", () => {
    const workspaceSummary = {
      ...blockedSummary,
      accessStatus: "workspace_available" as const,
      accessMode: "paid" as const,
      accessLevel: "read_write" as const,
      canEnterWorkspace: true,
    };

    expect(AdminTenantServiceAccessSchema.safeParse({
      ...workspaceSummary,
      accessMode: "service_blocked",
    }).success).toBe(false);
    expect(AdminTenantServiceAccessSchema.safeParse({
      ...workspaceSummary,
      accessLevel: "read_only",
    }).success).toBe(false);
  });
});
