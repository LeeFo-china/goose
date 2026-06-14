import { afterEach, describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";
import { createWechatRebindRequest } from "./verify-role";

const originalCreate = wechatRebindRequestService.create;

afterEach(() => {
  wechatRebindRequestService.create = originalCreate;
});

describe("createWechatRebindRequest", () => {
  test("upgrades visitor sessions before creating rebind request", async () => {
    let resolvedAuthUserId: string | null | undefined;
    let upgradeCalled = false;

    wechatRebindRequestService.create = async (authUserId, input) => {
      resolvedAuthUserId = authUserId;
      return {
        id: "request-id",
        status: "pending",
        message: `created for ${input.phone}`,
      };
    };

    const request = {
      body: {
        phone: "13800138000",
        code: "123456",
        target_role: "customer",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "22222222-2222-4222-8222-222222222222",
      },
      user: {
        token_type: "visitor_session",
        openid: "visitor-openid",
      },
    } as unknown as FastifyRequest;

    const context = {
      async getAuthUserIdForRoleVerification(inputRequest: FastifyRequest) {
        expect(inputRequest).toBe(request);
        upgradeCalled = true;
        return "33333333-3333-4333-8333-333333333333";
      },
    };

    await createWechatRebindRequest.call(
      context,
      request,
      {} as FastifyReply,
    );

    expect(upgradeCalled).toBe(true);
    expect(resolvedAuthUserId).toBe("33333333-3333-4333-8333-333333333333");
  });
});
