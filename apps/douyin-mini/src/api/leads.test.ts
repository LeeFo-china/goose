import { describe, expect, test } from "bun:test";
import { DOUYIN_ENTRY_PATH_VALUES as CANONICAL_ENTRY_PATHS } from
  "../../../../packages/domain/src/douyin-miniapp";
import type { LaunchContext } from "../models";
import { sendLeadSms, submitLead } from "./leads";
import { ApiClient, type TransportInput } from "./request";

const attribution: LaunchContext = {
  entry_path: "pages/lead/index",
  scene: "021001",
  source_type: "live",
  campaign_code: "summer-2026",
};

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

describe("Douyin lead API client", () => {
  test("forwards every canonical entry path in the strict appointment payload", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return {
        lead_id: "55555555-5555-4555-8555-555555555555",
        appointment_no: "DYLF-20260825-000001",
        already_submitted: false,
        existing_customer_linked: false,
        status: "pending_confirmation",
        message: "量房申请已提交，工作人员将与你确认具体时间",
      };
    });
    for (const [index, entryPath] of CANONICAL_ENTRY_PATHS.entries()) {
      await submitLead(client, {
        name: "李先生",
        phone: "13800000000",
        sms_code: "123456",
        community: "示例花园",
        preferred_visit_date: "2026-08-25",
        preferred_visit_period: "afternoon",
        privacy_policy_version: "2026-07-19",
        consented_at: "2026-07-19T10:00:00.000Z",
        idempotency_key: eventId(index + 1),
        attribution: { ...attribution, entry_path: entryPath },
      });
    }
    expect(calls.map((call) => (
      call.data as { attribution: LaunchContext }
    ).attribution.entry_path)).toEqual([...CANONICAL_ENTRY_PATHS]);
  });

  test("sends the strict SMS payload and validates its cooldown", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      return { success: true, cooldown_seconds: 60, extra: "discarded" };
    });

    await expect(sendLeadSms(client, { phone: "13800000000", attribution }))
      .resolves.toEqual({ success: true, cooldown_seconds: 60 });
    expect(calls).toEqual([{
      path: "/douyin-mini/sms/send",
      method: "POST",
      data: { phone: "13800000000", attribution },
      token: "test-token",
    }]);
  });

  test("submits only the documented lead fields and validates the result", async () => {
    const input = {
      name: "李先生",
      phone: "13800000000",
      sms_code: "123456",
      community: "示例花园",
      preferred_visit_date: "2026-08-25",
      preferred_visit_period: "afternoon" as const,
      budget_estimate_id: "22222222-2222-4222-8222-222222222222",
      demand: "偏好现代简约",
      privacy_policy_version: "2026-07-19",
      consented_at: "2026-07-19T10:00:00.000Z",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
      attribution,
    };
    const client = clientWith((request) => {
      expect(request).toMatchObject({
        path: "/douyin-mini/leads",
        method: "POST",
        data: input,
      });
      return {
        lead_id: "55555555-5555-4555-8555-555555555555",
        appointment_no: "DYLF-20260825-000001",
        already_submitted: true,
        existing_customer_linked: false,
        status: "pending_confirmation",
        message: "量房申请已提交，工作人员将与你确认具体时间",
      };
    });

    await expect(submitLead(client, input)).resolves.toMatchObject({
      appointment_no: "DYLF-20260825-000001",
      already_submitted: true,
      existing_customer_linked: false,
      status: "pending_confirmation",
    });
  });

  test("strictly rejects malformed or expanded appointment responses", async () => {
    await expect(sendLeadSms(clientWith(() => ({
      success: true,
      cooldown_seconds: 0,
    })), { phone: "13800000000", attribution }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    await expect(submitLead(clientWith(() => ({
      lead_id: "55555555-5555-4555-8555-555555555555",
      appointment_no: "DYLF-20260825-000001",
      already_submitted: false,
      existing_customer_linked: false,
      status: "pending_confirmation",
      message: "量房申请已提交，工作人员将与你确认具体时间",
      internal_customer_id: "66666666-6666-4666-8666-666666666666",
    })), {
      name: "李先生",
      phone: "13800000000",
      sms_code: "123456",
      community: "示例花园",
      preferred_visit_date: "2026-08-25",
      preferred_visit_period: "afternoon",
      privacy_policy_version: "2026-07-19",
      consented_at: "2026-07-19T10:00:00.000Z",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
      attribution,
    })).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
});

function eventId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
