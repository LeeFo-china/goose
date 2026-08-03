import { describe, expect, test } from "bun:test";
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
      area: 120,
      budget: "20-30万",
      start_time: "三个月内",
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
        already_submitted: true,
        updated_existing: true,
        message: "你已提交预约，我们将尽快联系你",
      };
    });

    await expect(submitLead(client, input)).resolves.toMatchObject({
      already_submitted: true,
      updated_existing: true,
    });
  });

  test("rejects malformed provider responses", async () => {
    await expect(sendLeadSms(clientWith(() => ({
      success: true,
      cooldown_seconds: 0,
    })), { phone: "13800000000", attribution }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    await expect(submitLead(clientWith(() => ({
      lead_id: "not-a-uuid",
      already_submitted: false,
      updated_existing: false,
      message: "你已提交预约，我们将尽快联系你",
    })), {
      name: "李先生",
      phone: "13800000000",
      sms_code: "123456",
      privacy_policy_version: "2026-07-19",
      consented_at: "2026-07-19T10:00:00.000Z",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
      attribution,
    })).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
});
