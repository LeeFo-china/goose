import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";

import {
  EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES,
  EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES,
  EmployeeServiceAccessSummarySchema,
  TENANT_SERVICE_ACCESS_MODE_VALUES,
  TENANT_SERVICE_ROUTE_ACCESS_VALUES,
} from "./platform-service-access";

describe("platform service access domain contract", () => {
  test("ships employee bootstrap access under a new immutable version", () => {
    const [major, minor] = packageJson.version.split(".").map(Number);
    expect(major).toBe(1);
    expect(minor).toBeGreaterThanOrEqual(16);
  });

  test("keeps service modes and route access values stable", () => {
    expect(TENANT_SERVICE_ACCESS_MODE_VALUES).toEqual([
      "paid",
      "paid_onboarding",
      "trial",
      "grace",
      "legacy",
      "service_blocked",
      "hard_blocked",
    ]);
    expect(TENANT_SERVICE_ROUTE_ACCESS_VALUES).toEqual([
      "session",
      "recovery",
      "read",
      "write",
      "public_or_callback",
    ]);
  });

  test("keeps employee service access statuses and actions stable", () => {
    expect(EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES).toEqual([
      "workspace_available",
      "pending_review",
      "scheduled",
      "grace_period",
      "expired",
      "service_blocked",
      "hard_blocked",
    ]);
    expect(EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES).toEqual([
      "enter_workspace",
      "enter_readonly_workspace",
      "view_trial",
      "apply_trial",
      "purchase_service",
      "contact_platform",
      "refresh",
    ]);
  });

  test("validates the employee service access decision matrix", () => {
    const summary = {
      can_enter_workspace: true,
      readonly: false,
      access_mode: "paid" as const,
      access_level: "read_write" as const,
      access_status: "workspace_available" as const,
      trial_id: null,
      trial_status: null,
      starts_at: "2026-08-12T00:00:00.000Z",
      ends_at: "2027-08-12T00:00:00.000Z",
      title: "服务正常",
      message: "可进入工作台",
      primary_action: {
        key: "enter_workspace" as const,
        label: "进入工作台",
        path: "/pages/index/index",
      },
      secondary_action: null,
      evaluated_at: "2026-08-12T00:00:00.000Z",
    };

    expect(EmployeeServiceAccessSummarySchema.safeParse(summary).success)
      .toBe(true);
    expect(EmployeeServiceAccessSummarySchema.safeParse({
      ...summary,
      can_enter_workspace: false,
      readonly: true,
    }).success).toBe(false);
    expect(EmployeeServiceAccessSummarySchema.safeParse({
      ...summary,
      access_status: "grace_period",
      access_mode: "grace",
      access_level: "read_only",
      readonly: false,
    }).success).toBe(false);
    expect(EmployeeServiceAccessSummarySchema.safeParse({
      ...summary,
      access_status: "expired",
      access_mode: "service_blocked",
      access_level: "none",
      can_enter_workspace: true,
    }).success).toBe(false);
  });
});
