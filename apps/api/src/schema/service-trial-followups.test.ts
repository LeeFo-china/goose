import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  CancelServiceTrialFollowUpSchema,
  CreateServiceTrialFollowUpSchema,
  ServiceTrialFollowUpParamSchema,
  ServiceTrialFollowUpListQuerySchema,
} from "./service-trial-followups";

const createFollowUp = {
  follow_up_type: "phone" as const,
  summary: "已完成首轮使用回访",
  result: "客户正在评估核心功能",
  idempotency_key: randomUUID(),
};

describe("service trial follow-up schemas", () => {
  test("accepts only the fixed follow-up type allow-list", () => {
    const followUpTypes = [
      "phone",
      "wechat",
      "online_meeting",
      "onsite",
      "other",
    ];

    for (const followUpType of followUpTypes) {
      expect(CreateServiceTrialFollowUpSchema.safeParse({
        ...createFollowUp,
        follow_up_type: followUpType,
      }).success).toBe(true);
    }

    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      follow_up_type: "email",
    }).success).toBe(false);
  });

  test("defaults creation to completed and rejects canceled creation", () => {
    expect(CreateServiceTrialFollowUpSchema.parse(createFollowUp)).toEqual({
      ...createFollowUp,
      status: "completed",
    });
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      status: "completed",
    }).success).toBe(true);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      status: "canceled",
    }).success).toBe(false);
  });

  test("requires a next follow-up time for pending creation", () => {
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      status: "pending",
      next_follow_up_at: "2026-08-18T02:00:00.000Z",
    }).success).toBe(true);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      status: "pending",
      next_follow_up_at: null,
    }).success).toBe(false);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      status: "pending",
    }).success).toBe(false);
  });

  test("accepts optional or nullable RFC3339 next follow-up times", () => {
    expect(CreateServiceTrialFollowUpSchema.safeParse(createFollowUp).success)
      .toBe(true);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      next_follow_up_at: null,
    }).success).toBe(true);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      next_follow_up_at: "2026-08-18T10:00:00+08:00",
    }).success).toBe(true);

    const invalidDateTimes = [
      "2026-08-18T02:00:00",
      "2026-08-18 02:00:00Z",
      "not-a-date",
    ];
    for (const nextFollowUpAt of invalidDateTimes) {
      expect(CreateServiceTrialFollowUpSchema.safeParse({
        ...createFollowUp,
        next_follow_up_at: nextFollowUpAt,
      }).success).toBe(false);
    }
  });

  test("trims and bounds summary and result", () => {
    expect(CreateServiceTrialFollowUpSchema.parse({
      ...createFollowUp,
      summary: " 首轮回访 ",
      result: " 客户继续评估 ",
    })).toMatchObject({
      summary: "首轮回访",
      result: "客户继续评估",
    });

    const invalidTextValues = [
      { summary: " ", result: "有效结果" },
      { summary: "摘".repeat(501), result: "有效结果" },
      { summary: "有效摘要", result: " " },
      { summary: "有效摘要", result: "结".repeat(1001) },
    ];
    for (const textValues of invalidTextValues) {
      expect(CreateServiceTrialFollowUpSchema.safeParse({
        ...createFollowUp,
        ...textValues,
      }).success).toBe(false);
    }

    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      summary: "摘".repeat(500),
      result: "结".repeat(1000),
    }).success).toBe(true);
  });

  test("defaults and bounds strict list pagination with status filtering", () => {
    expect(ServiceTrialFollowUpListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(ServiceTrialFollowUpListQuerySchema.parse({
      page: "2",
      pageSize: "100",
      status: "pending",
    })).toEqual({
      page: 2,
      pageSize: 100,
      status: "pending",
    });

    for (const status of ["pending", "completed", "canceled"]) {
      expect(ServiceTrialFollowUpListQuerySchema.safeParse({ status }).success)
        .toBe(true);
    }
    expect(ServiceTrialFollowUpListQuerySchema.safeParse({ status: "active" }).success)
      .toBe(false);
    expect(ServiceTrialFollowUpListQuerySchema.safeParse({ pageSize: 101 }).success)
      .toBe(false);
    expect(ServiceTrialFollowUpListQuerySchema.safeParse({ unknown: true }).success)
      .toBe(false);
  });

  test("requires UUID v4 idempotency keys", () => {
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      idempotency_key: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    }).success).toBe(false);
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      idempotency_key: randomUUID(),
    }).success).toBe(true);
  });

  test("accepts only a strict canceled status command", () => {
    const cancelCommand = {
      status: "canceled" as const,
      idempotency_key: randomUUID(),
    };

    expect(CancelServiceTrialFollowUpSchema.parse(cancelCommand))
      .toEqual(cancelCommand);
    expect(CancelServiceTrialFollowUpSchema.safeParse({
      ...cancelCommand,
      status: "completed",
    }).success).toBe(false);
    expect(CancelServiceTrialFollowUpSchema.safeParse({
      ...cancelCommand,
      idempotency_key: "not-a-uuid",
    }).success).toBe(false);
    expect(CancelServiceTrialFollowUpSchema.safeParse({
      ...cancelCommand,
      reason: "不再需要跟进",
    }).success).toBe(false);
  });

  test("requires bound trial and follow-up UUID path params", () => {
    expect(ServiceTrialFollowUpParamSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      followUpId: "22222222-2222-4222-8222-222222222222",
    })).toBeTruthy();
    expect(ServiceTrialFollowUpParamSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      followUpId: "bad-id",
    }).success).toBe(false);
  });

  test("rejects unknown creation keys", () => {
    expect(CreateServiceTrialFollowUpSchema.safeParse({
      ...createFollowUp,
      trial_id: randomUUID(),
    }).success).toBe(false);
  });
});
