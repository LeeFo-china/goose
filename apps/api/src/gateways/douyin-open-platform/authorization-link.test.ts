import { describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

import { DouyinOpenPlatformClient } from "./client";

const COMPONENT_TOKEN = "component-token-value";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("DouyinOpenPlatformClient authorization links", () => {
  test("generates the exact official V3 authorization-only link", async () => {
    const fetch = mock(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) =>
      jsonResponse({
        err_no: 0,
        err_msg: "",
        log_id: "auth-link-log",
        data: {
          link: "https://open.douyin.com/authorize/example",
        },
      }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.generateAuthorizationLink({
      componentAccessToken: COMPONENT_TOKEN,
      redirectUri:
        "https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback?intent=opaque",
    })).resolves.toEqual({
      link: "https://open.douyin.com/authorize/example",
      logId: "auth-link-log",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v3/auth/gen_link/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": COMPONENT_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        link_type: 1,
        redirect_uri:
          "https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback?intent=opaque",
      }),
    });
  });

  test("rejects unsafe or malformed authorization-link responses", async () => {
    for (const link of [
      "http://open.douyin.com/authorize/example",
      "https://user:password@open.douyin.com/authorize/example",
      "not-a-url",
    ]) {
      const client = new DouyinOpenPlatformClient({
        fetch: async (_input, _init) =>
          jsonResponse({
            err_no: 0,
            err_msg: "",
            log_id: "unsafe-link-log",
            data: { link },
          }),
      });

      await expect(client.generateAuthorizationLink({
        componentAccessToken: COMPONENT_TOKEN,
        redirectUri: "https://admin-dev.goodcms.cn/callback",
      })).rejects.toMatchObject({
        code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
        details: { log_id: "unsafe-link-log" },
      });
    }
  });

  test("rejects API errors without echoing the upstream message", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) =>
        jsonResponse({
          err_no: 40_001,
          err_msg: "bad authorization-code",
          log_id: "auth-link-error-log",
        }),
    });

    let caught: unknown;
    try {
      await client.generateAuthorizationLink({
        componentAccessToken: COMPONENT_TOKEN,
        redirectUri: "https://admin-dev.goodcms.cn/callback",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: "DOUYIN_OPEN_PLATFORM_API_ERROR",
      details: { log_id: "auth-link-error-log" },
    });
    expect(JSON.stringify(caught)).not.toContain("authorization-code");
    expect(JSON.stringify(caught)).not.toContain(COMPONENT_TOKEN);
  });
});
