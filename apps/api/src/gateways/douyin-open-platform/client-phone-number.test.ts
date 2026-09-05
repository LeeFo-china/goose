import { describe, expect, mock, test } from "bun:test";
import { DouyinOpenPlatformClient } from "./client";

const AUTHORIZER_TOKEN = "authorizer-token-value";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DouyinOpenPlatformClient phone number", () => {
  test("exchanges a Douyin getPhoneNumber code with the official endpoint", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ err_no: 0, log_id: "phone-log", data: "13800000000" }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getPhoneNumberInfo({
      appId: "authorizer-appid",
      authorizerAccessToken: AUTHORIZER_TOKEN,
      code: "phone-code",
    })).resolves.toEqual({ phone: "13800000000" });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/get_phonenumber_info/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code: "phone-code" }),
    });
  });

  test("rejects malformed phone responses without exposing the code or token", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "phone-log",
        data: "not-a-phone",
      }),
    });

    let caught: unknown;
    try {
      await client.getPhoneNumberInfo({
        appId: "authorizer-appid",
        authorizerAccessToken: AUTHORIZER_TOKEN,
        code: "phone-code",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
    });
    expect(JSON.stringify(caught)).not.toContain(AUTHORIZER_TOKEN);
    expect(JSON.stringify(caught)).not.toContain("phone-code");
  });
});
