import { describe, expect, test } from "bun:test";

import { ApiClient, type TransportInput } from "./request";
import {
  authorizeDouyinCustomerPhone,
  selectDouyinCustomerIdentity,
  sendDouyinCustomerSmsCode,
  verifyDouyinCustomerSms,
} from "./customer-auth";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "mini-session-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

describe("Douyin customer auth API client", () => {
  test("uses protected Douyin mini-session routes for phone login", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(`${input.method} ${input.path}`);
      if (input.path.endsWith("/send-code")) {
        return { success: true, cooldown_seconds: 60 };
      }
      return {
        status: "authenticated",
        auth: customerAuth(),
      };
    });

    await expect(sendDouyinCustomerSmsCode(client, "13800138000"))
      .resolves.toEqual({ success: true, cooldown_seconds: 60 });
    await expect(verifyDouyinCustomerSms(client, {
      phone: "13800138000",
      code: "123456",
    })).resolves.toMatchObject({ status: "authenticated" });
    await expect(authorizeDouyinCustomerPhone(client, "official-code"))
      .resolves.toMatchObject({ status: "authenticated" });

    expect(paths).toEqual([
      "POST /douyin-mini/customer-auth/sms/send-code",
      "POST /douyin-mini/customer-auth/sms/verify",
      "POST /douyin-mini/customer-auth/authorize-phone",
    ]);
  });

  test("parses selection_required and select responses", async () => {
    const client = clientWith((input) => {
      if (input.path.endsWith("/select")) {
        return { status: "authenticated", auth: customerAuth() };
      }
      return {
        status: "selection_required",
        selection_token: "S".repeat(43),
        expires_in: 300,
        phone_masked: "138****8000",
        candidates: [{
          candidate_id: "11111111-1111-4111-8111-111111111111",
          target_mode: "customer",
          role_label: "客户",
          title: "青禾装饰",
          subtitle: "张三",
          binding_state: "bindable",
        }],
      };
    });

    const result = await verifyDouyinCustomerSms(client, {
      phone: "13800138000",
      code: "123456",
    });
    expect(result.status).toBe("selection_required");
    await expect(selectDouyinCustomerIdentity(client, {
      selectionToken: "S".repeat(43),
      candidateId: "11111111-1111-4111-8111-111111111111",
    })).resolves.toMatchObject({ status: "authenticated" });
  });
});

function customerAuth() {
  return {
    token: "customer-token",
    user_id: "77777777-7777-4777-8777-777777777777",
    mode: "customer",
    authMode: "customer",
    roles: ["customer"],
    verified_phone: "13800138000",
    has_customer_profile: true,
    tenant: { id: "33333333-3333-4333-8333-333333333333", name: "青禾装饰", slug: "qinghe" },
    customer: { id: "11111111-1111-4111-8111-111111111111", name: "张三", phone: "13800138000" },
  };
}
