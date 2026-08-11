import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  PlatformServiceTrialAssignSchema,
  PlatformServiceTrialExtendSchema,
  PlatformServiceTrialGrantSchema,
  PlatformServiceTrialListQuerySchema,
  PlatformServiceTrialPolicyUpdateSchema,
  PlatformServiceTrialReviewSchema,
  PlatformServiceTrialRevokeSchema,
  ServiceTrialApplicationCreateSchema,
  ServiceTrialWithdrawSchema,
} from "./service-trials";

const scope: {
  version: 1;
  capabilities: Array<"core.projects" | "core.customers">;
} = {
  version: 1,
  capabilities: ["core.projects", "core.customers"],
};

describe("service trial schemas", () => {
  test("validates a strict tenant application with bounded contact data", () => {
    const application = {
      application_reason: "希望评估项目和客户协同能力",
      expected_user_count: 8,
      expected_project_count: 3,
      contact_name: "张经理",
      contact_phone: "13800000000",
      idempotency_key: randomUUID(),
    };

    expect(ServiceTrialApplicationCreateSchema.parse(application)).toEqual(application);
    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      scope,
    }).success).toBe(false);
    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      contact_phone: "12800000000",
    }).success).toBe(false);
    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      expected_user_count: 0,
    }).success).toBe(false);
    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      expected_project_count: 0,
    }).success).toBe(false);
  });

  test("requires UUID v4 idempotency keys", () => {
    const application = {
      application_reason: "评估系统",
      expected_user_count: 2,
      expected_project_count: 1,
      contact_name: "张经理",
      contact_phone: "13800000000",
    };

    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      idempotency_key: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    }).success).toBe(false);
    expect(ServiceTrialApplicationCreateSchema.safeParse({
      ...application,
      idempotency_key: randomUUID(),
    }).success).toBe(true);
  });

  test("defaults strict platform list pagination and validates filters", () => {
    expect(PlatformServiceTrialListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(PlatformServiceTrialListQuerySchema.parse({
      page: "2",
      pageSize: "100",
      keyword: "张经理",
      status: "active",
      source: "tenant_application",
      trialType: "guided",
      assigneeEmployeeId: randomUUID(),
      appliedFrom: "2026-08-01T00:00:00.000Z",
      appliedTo: "2026-08-31T23:59:59.000Z",
      expiresFrom: "2026-09-01T00:00:00.000Z",
      expiresTo: "2026-09-30T23:59:59.000Z",
    })).toMatchObject({ page: 2, pageSize: 100, status: "active" });
    expect(PlatformServiceTrialListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
    expect(PlatformServiceTrialListQuerySchema.safeParse({ unknown: true }).success)
      .toBe(false);
  });

  test("does not inject policy duration defaults into grants", () => {
    const parsed = PlatformServiceTrialGrantSchema.parse({
      tenant_id: randomUUID(),
      trial_type: "standard",
      scope,
      assignee_employee_id: null,
      reason: "目标客户产品评估",
      idempotency_key: randomUUID(),
    });

    expect(parsed.trial_days).toBeUndefined();
    expect(parsed.grace_days).toBeUndefined();
    expect(parsed.starts_at).toBeUndefined();
  });

  test("requires a non-null assignee for guided grants", () => {
    const grant = {
      tenant_id: randomUUID(),
      trial_type: "guided" as const,
      scope,
      reason: "陪跑评估",
      idempotency_key: randomUUID(),
    };

    expect(PlatformServiceTrialGrantSchema.safeParse({
      ...grant,
      assignee_employee_id: randomUUID(),
    }).success).toBe(true);
    expect(PlatformServiceTrialGrantSchema.safeParse({
      ...grant,
      assignee_employee_id: null,
    }).success).toBe(false);
    expect(PlatformServiceTrialGrantSchema.safeParse(grant).success).toBe(false);
  });

  test("allows override durations only within database hard limits", () => {
    const command = {
      expected_version: 1,
      idempotency_key: randomUUID(),
      reason: "高权限例外试用",
    };
    const grant = {
      tenant_id: randomUUID(),
      trial_type: "standard" as const,
      scope,
      assignee_employee_id: null,
      reason: command.reason,
      idempotency_key: command.idempotency_key,
    };
    const approvedReview = {
      ...command,
      decision: "approved" as const,
      trial_type: "standard" as const,
      scope,
      assignee_employee_id: null,
    };

    expect(PlatformServiceTrialGrantSchema.safeParse({
      ...grant,
      trial_days: 61,
      grace_days: 15,
    }).success).toBe(true);
    expect(PlatformServiceTrialReviewSchema.safeParse({
      ...approvedReview,
      trial_days: 61,
      grace_days: 15,
    }).success).toBe(true);
    expect(PlatformServiceTrialExtendSchema.safeParse({
      ...command,
      extension_days: 31,
    }).success).toBe(true);

    expect(PlatformServiceTrialGrantSchema.safeParse({
      ...grant,
      trial_days: 366,
    }).success).toBe(false);
    expect(PlatformServiceTrialReviewSchema.safeParse({
      ...approvedReview,
      grace_days: 31,
    }).success).toBe(false);
    expect(PlatformServiceTrialExtendSchema.safeParse({
      ...command,
      extension_days: 366,
    }).success).toBe(false);
  });

  test("uses a strict decision union for approved and rejected reviews", () => {
    const command = {
      expected_version: 1,
      idempotency_key: randomUUID(),
      reason: "资料符合要求",
    };
    const approved = PlatformServiceTrialReviewSchema.parse({
      ...command,
      decision: "approved",
      trial_type: "standard",
      scope,
    });

    expect("trial_days" in approved).toBe(false);
    expect("grace_days" in approved).toBe(false);
    expect(PlatformServiceTrialReviewSchema.safeParse({
      ...command,
      decision: "approved",
      trial_type: "guided",
      scope,
      assignee_employee_id: null,
    }).success).toBe(false);
    expect(PlatformServiceTrialReviewSchema.safeParse({
      ...command,
      decision: "rejected",
    }).success).toBe(true);
    expect(PlatformServiceTrialReviewSchema.safeParse({
      ...command,
      decision: "rejected",
      scope,
    }).success).toBe(false);
  });

  test("validates optimistic-lock action schemas", () => {
    const command = {
      expected_version: 2,
      idempotency_key: randomUUID(),
      reason: "业务原因",
    };

    expect(ServiceTrialWithdrawSchema.safeParse(command).success).toBe(true);
    expect(PlatformServiceTrialRevokeSchema.safeParse(command).success).toBe(true);
    expect(PlatformServiceTrialExtendSchema.safeParse({
      ...command,
      extension_days: 15,
    }).success).toBe(true);
    expect(PlatformServiceTrialExtendSchema.safeParse({
      ...command,
      extension_days: 366,
    }).success).toBe(false);
    expect(PlatformServiceTrialAssignSchema.safeParse({
      expected_version: 2,
      idempotency_key: randomUUID(),
      assignee_employee_id: null,
    }).success).toBe(true);
    expect(PlatformServiceTrialAssignSchema.safeParse({
      expected_version: 0,
      idempotency_key: randomUUID(),
      assignee_employee_id: randomUUID(),
    }).success).toBe(false);
  });

  test("replaces the complete policy with valid bounded values", () => {
    const policy = {
      default_trial_days: 30,
      default_grace_days: 7,
      max_trial_days: 60,
      max_grace_days: 14,
      max_schedule_ahead_days: 30,
      max_extension_count: 1,
      max_extension_days: 30,
      reminder_days: [7, 3, 1],
      reapply_cooldown_days: 30,
      allow_repeat_application: false,
      standard_scope: scope,
      guided_scope: scope,
      expected_version: 1,
      idempotency_key: randomUUID(),
      reason: "调整平台默认试用规则",
    };

    expect(PlatformServiceTrialPolicyUpdateSchema.parse(policy)).toEqual(policy);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      default_trial_days: 61,
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      default_grace_days: 15,
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      max_schedule_ahead_days: 31,
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      reminder_days: [7, 7, 1],
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      reminder_days: [3, 7, 1],
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      standard_scope: { version: 1, capabilities: [] },
    }).success).toBe(false);
    expect(PlatformServiceTrialPolicyUpdateSchema.safeParse({
      ...policy,
      extra: true,
    }).success).toBe(false);
  });
});
