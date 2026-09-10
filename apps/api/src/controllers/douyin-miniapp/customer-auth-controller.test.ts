import { describe, expect, mock, test } from "bun:test";

import { DouyinCustomerAuthController } from "./customer-auth-controller";

describe("DouyinCustomerAuthController", () => {
  test("validates and dispatches customer auth routes", async () => {
    const sendCode = mock(async () => ({ success: true, cooldown_seconds: 60 }));
    const verifySms = mock(async () => ({ status: "authenticated" }));
    const authorizePhone = mock(async () => ({ status: "authenticated" }));
    const select = mock(async () => ({ status: "authenticated" }));
    const controller = new DouyinCustomerAuthController({
      sendCode,
      verifySms,
      authorizePhone,
      select,
    } as never);
    const user = { token_type: "douyin_miniapp", subject_hash: "a".repeat(64) };
    const routes: Record<string, (request: unknown) => Promise<unknown>> = {};
    controller.registerExtraRoutes({
      post: (path: string, handler: (request: unknown) => Promise<unknown>) => {
        routes[`POST ${path}`] = handler;
      },
    } as never);

    await routes["POST /douyin-mini/customer-auth/sms/send-code"]!({
      user,
      body: { phone: "13800138000" },
      headers: {},
      ip: "127.0.0.1",
      log: {},
    });
    expect(sendCode).toHaveBeenCalledWith(expect.objectContaining({
      input: { phone: "13800138000" },
      requestIp: "127.0.0.1",
    }));

    await routes["POST /douyin-mini/customer-auth/sms/verify"]!({
      user,
      body: { phone: "13800138000", code: "123456" },
    });
    expect(verifySms).toHaveBeenCalledWith(expect.objectContaining({
      input: { phone: "13800138000", code: "123456" },
    }));

    await routes["POST /douyin-mini/customer-auth/authorize-phone"]!({
      user,
      body: { douyin_phone_code: "official-phone-code" },
    });
    expect(authorizePhone).toHaveBeenCalledWith(expect.objectContaining({
      input: { douyin_phone_code: "official-phone-code" },
    }));

    await routes["POST /douyin-mini/customer-auth/select"]!({
      user,
      body: {
        selection_token: "A".repeat(43),
        candidate_id: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        selection_token: "A".repeat(43),
        candidate_id: "11111111-1111-4111-8111-111111111111",
      },
    }));

    await expect(routes["POST /douyin-mini/customer-auth/sms/send-code"]!({
      user,
      body: { phone: "13800138000", tenant_id: crypto.randomUUID() },
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
