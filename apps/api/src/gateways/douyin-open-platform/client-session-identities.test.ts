import { describe, expect, test } from "bun:test";
import { DouyinOpenPlatformClient } from "./client";

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DouyinOpenPlatformClient session identities", () => {
  test("accepts anonymous-only identities from both code2session variants", async () => {
    const merchant = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "merchant-anonymous-log",
        data: { session_key: "session-key", anonymous_open_id: "anonymous-merchant" },
      }),
    });
    await expect(merchant.code2Session({
      authorizerAccessToken: "authorizer-token",
      appId: "authorizer-appid",
      code: "login-code",
    })).resolves.toMatchObject({ anonymousOpenId: "anonymous-merchant" });

    const template = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "template-anonymous-log",
        data: { session_key: "session-key", anonymous_openid: "anonymous-template" },
      }),
    });
    await expect(template.code2SessionForTemplate({
      appId: "template-appid",
      appSecret: "component-secret",
      code: "login-code",
    })).resolves.toMatchObject({ anonymousOpenId: "anonymous-template" });
  });
});
