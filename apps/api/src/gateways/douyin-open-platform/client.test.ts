import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { DouyinOpenPlatformClient, type DouyinFetch } from "./client";

const COMPONENT_TOKEN = "component-token-value";
const AUTHORIZER_TOKEN = "authorizer-token-value";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function expectSafeError(error: unknown, code: string, logId?: string): void {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code });
  const appError = error as AppError;
  expect(appError.details).toEqual(logId ? { log_id: logId } : undefined);
  const serialized = JSON.stringify(error);
  for (const sensitive of [
    "component-secret", "ticket-secret", "authorization-code",
    "refresh-token", "login-code", "openid-value", COMPONENT_TOKEN,
    AUTHORIZER_TOKEN,
  ]) {
    expect(serialized).not.toContain(sensitive);
  }
}

describe("DouyinOpenPlatformClient requests", () => {
  test("gets a component access token with the exact official V2 request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      component_access_token: COMPONENT_TOKEN,
      expires_in: 3600,
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getComponentAccessToken({
      componentAppId: "component-appid",
      componentAppSecret: "component-secret",
      componentTicket: "ticket-secret",
    })).resolves.toEqual({ accessToken: COMPONENT_TOKEN, expiresIn: 3600 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/openapi/v2/auth/tp/token/?component_appid=component-appid&component_appsecret=component-secret&component_ticket=ticket-secret",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  test("exchanges an authorization code with exact query names", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(authorizerSuccess()));
    const client = new DouyinOpenPlatformClient({ fetch });

    const result = await client.exchangeAuthorizationCode({
      componentAccessToken: COMPONENT_TOKEN,
      authorizationCode: "authorization-code",
    });

    expect(result).toMatchObject({
      accessToken: AUTHORIZER_TOKEN,
      authorizerAppId: "authorizer-appid",
      refreshToken: "refresh-token",
      expiresIn: 7200,
      refreshExpiresIn: 2_592_000,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v2/auth/get_auth_token/?grant_type=app_to_tp_authorization_code&authorization_code=authorization-code",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { "access-token": COMPONENT_TOKEN },
    });
  });

  test("refreshes authorizer credentials with the rotating refresh-token query", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(authorizerSuccess()));
    const client = new DouyinOpenPlatformClient({ fetch });

    await client.refreshAuthorizerToken({
      componentAccessToken: COMPONENT_TOKEN,
      authorizerRefreshToken: "refresh-token",
    });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v2/auth/get_auth_token/?grant_type=app_to_tp_refresh_token&authorizer_refresh_token=refresh-token",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { "access-token": COMPONENT_TOKEN },
    });
  });

  test("retrieves a replacement authorization code with the exact official request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      log_id: "retrieve-log",
      data: { authorization_code: "replacement-code" },
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.retrieveAuthorizationCode({
      componentAccessToken: COMPONENT_TOKEN,
      authorizationAppId: "authorizer-appid",
    })).resolves.toBe("replacement-code");
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/tpapp/v2/auth/retrieve_auth_code/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "access-token": COMPONENT_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ authorization_appid: "authorizer-appid" }),
    });
  });

  test("posts the exact merchant code2session V2 request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      err_msg: "",
      log_id: "log-merchant",
      data: { session_key: "session-key", open_id: "openid-value" },
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.code2Session({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      code: "login-code",
    })).resolves.toEqual({
      sessionKey: "session-key",
      openId: "openid-value",
      anonymousOpenId: undefined,
      unionId: undefined,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/microapp/code2session/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code: "login-code", app_id: "authorizer-appid" }),
    });
  });

  test("posts the exact ordinary template-development code2Session request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      err_tips: "success",
      log_id: "log-template",
      data: { session_key: "session-key", openid: "openid-value" },
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.code2SessionForTemplate({
      appId: "template-appid",
      appSecret: "component-secret",
      code: "login-code",
    })).resolves.toMatchObject({ sessionKey: "session-key", openId: "openid-value" });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://developer.toutiao.com/api/apps/v2/jscode2session",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appid: "template-appid", secret: "component-secret", code: "login-code" }),
    });
  });

});

describe("DouyinOpenPlatformClient failures", () => {
  test("wraps HTTP, network, invalid JSON and non-object responses", async () => {
    const cases: Array<{
      fetch: DouyinFetch;
      code: string;
      logId?: string;
    }> = [
      { fetch: async (_input, _init) => jsonResponse({ log_id: "http-log" }, 502), code: "DOUYIN_OPEN_PLATFORM_HTTP_ERROR", logId: "http-log" },
      { fetch: async (_input, _init) => new Response("<html>upstream failed</html>", { status: 502 }), code: "DOUYIN_OPEN_PLATFORM_HTTP_ERROR" },
      { fetch: async (_input, _init) => { throw new TypeError("network contained component-secret"); }, code: "DOUYIN_OPEN_PLATFORM_NETWORK_ERROR" },
      { fetch: async (_input, _init) => new Response("not-json"), code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID" },
      { fetch: async (_input, _init) => jsonResponse(["not-object"]), code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID" },
    ];

    for (const fixture of cases) {
      const client = new DouyinOpenPlatformClient({ fetch: fixture.fetch });
      let caught: unknown;
      try {
        await client.getComponentAccessToken({
          componentAppId: "component-appid",
          componentAppSecret: "component-secret",
          componentTicket: "ticket-secret",
        });
      } catch (error) {
        caught = error;
      }
      expectSafeError(caught, fixture.code, fixture.logId);
    }
  });

  test("rejects HTTP 200 API errors and exposes only log_id", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 40018,
        err_msg: "bad authorization-code",
        log_id: "safe-log-id",
      }),
    });

    let caught: unknown;
    try {
      await client.exchangeAuthorizationCode({
        componentAccessToken: COMPONENT_TOKEN,
        authorizationCode: "authorization-code",
      });
    } catch (error) {
      caught = error;
    }
    expectSafeError(caught, "DOUYIN_OPEN_PLATFORM_API_ERROR", "safe-log-id");
  });

  test("rejects non-zero legacy errno and missing success fields", async () => {
    const failures = [
      { body: { errno: "40037", message: "bad ticket-secret" }, code: "DOUYIN_OPEN_PLATFORM_API_ERROR", logId: undefined },
      { body: { expires_in: 3600 }, code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID", logId: undefined },
      { body: { ...authorizerSuccess(), data: { expires_in: 7200 } }, code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID", logId: "authorizer-log" },
    ];

    for (const failure of failures) {
      const client = new DouyinOpenPlatformClient({ fetch: async (_input, _init) => jsonResponse(failure.body) });
      let caught: unknown;
      try {
        if ("errno" in failure.body || "component_access_token" in failure.body || "expires_in" in failure.body) {
          await client.getComponentAccessToken({
            componentAppId: "component-appid",
            componentAppSecret: "component-secret",
            componentTicket: "ticket-secret",
          });
        } else {
          await client.exchangeAuthorizationCode({
            componentAccessToken: COMPONENT_TOKEN,
            authorizationCode: "authorization-code",
          });
        }
      } catch (error) {
        caught = error;
      }
      expectSafeError(caught, failure.code, failure.logId);
    }
  });

  test("uses a real AbortController with an injected 10-second timer", async () => {
    let receivedSignal: AbortSignal | undefined;
    const fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      if (receivedSignal?.aborted) throw new DOMException("aborted", "AbortError");
      throw new TypeError("timer did not abort");
    });
    const setTimeout = mock((handler: () => void, milliseconds: number) => {
      expect(milliseconds).toBe(10_000);
      handler();
      return 17;
    });
    const clearTimeout = mock((_handle: unknown) => undefined);
    const client = new DouyinOpenPlatformClient({ fetch, setTimeout, clearTimeout });

    await expect(client.getComponentAccessToken({
      componentAppId: "component-appid",
      componentAppSecret: "component-secret",
      componentTicket: "ticket-secret",
    })).rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_TIMEOUT" });
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(true);
    expect(clearTimeout).toHaveBeenCalledWith(17);
  });

  test("keeps the 10-second abort active while reading the response body", async () => {
    let abortRequest: (() => void) | undefined;
    let isTimerCleared = false;
    const setTimeout = mock((handler: () => void, milliseconds: number) => {
      expect(milliseconds).toBe(10_000);
      abortRequest = handler;
      return 23;
    });
    const clearTimeout = mock((_handle: unknown) => { isTimerCleared = true; });
    const fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      return new Response(new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      }));
    });
    const client = new DouyinOpenPlatformClient({ fetch, setTimeout, clearTimeout });
    const pending = client.getComponentAccessToken({
      componentAppId: "component-appid",
      componentAppSecret: "component-secret",
      componentTicket: "ticket-secret",
    });

    await Promise.resolve();
    expect(isTimerCleared).toBe(false);
    abortRequest?.();
    await expect(pending).rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_TIMEOUT" });
    expect(clearTimeout).toHaveBeenCalledWith(23);
  });

  test("rejects code2session responses missing required identity fields", async () => {
    const merchant = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 0, err_msg: "", log_id: "merchant-log", data: { session_key: "session-key" },
      }),
    });
    await expect(merchant.code2Session({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      code: "login-code",
    })).rejects.toMatchObject({
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
      details: { log_id: "merchant-log" },
    });

    const template = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 0, err_tips: "success", log_id: "template-log", data: { openid: "openid-value" },
      }),
    });
    await expect(template.code2SessionForTemplate({
      appId: "template-appid",
      appSecret: "component-secret",
      code: "login-code",
    })).rejects.toMatchObject({
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
      details: { log_id: "template-log" },
    });
  });

  test("refreshes an expired authorizer access token once and replays once", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ err_no: 28001008, err_msg: "expired", log_id: "expired-log" }))
      .mockResolvedValueOnce(jsonResponse({
        err_no: 0,
        err_msg: "",
        log_id: "success-log",
        data: { session_key: "session-key", open_id: "openid-value" },
      }));
    const retryAccessToken = mock(async () => "refreshed-authorizer-token");
    const client = new DouyinOpenPlatformClient({ fetch, retryAccessToken });

    await expect(client.code2Session({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      code: "login-code",
    })).resolves.toMatchObject({ openId: "openid-value" });
    expect(retryAccessToken).toHaveBeenCalledTimes(1);
    expect(retryAccessToken).toHaveBeenCalledWith({ appId: "authorizer-appid" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      "access-token": "refreshed-authorizer-token",
    });
  });

  test("does not loop when the replay also reports an expired token", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 28001008,
      err_msg: "expired",
      log_id: "expired-log",
    }));
    const retryAccessToken = mock(async () => "refreshed-authorizer-token");
    const client = new DouyinOpenPlatformClient({ fetch, retryAccessToken });

    await expect(client.code2Session({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      code: "login-code",
    })).rejects.toMatchObject({
      code: "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_EXPIRED",
      details: { log_id: "expired-log" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(retryAccessToken).toHaveBeenCalledTimes(1);
  });

  test("wraps retry callback failures without exposing their raw error", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 28001008,
        err_msg: "expired",
        log_id: "expired-log",
      }),
      retryAccessToken: async () => {
        throw new TypeError("refresh callback leaked refresh-token");
      },
    });
    let caught: unknown;
    try {
      await client.code2Session({
        authorizerAccessToken: AUTHORIZER_TOKEN,
        appId: "authorizer-appid",
        code: "login-code",
      });
    } catch (error) {
      caught = error;
    }
    expectSafeError(caught, "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_REFRESH_FAILED");
  });

  test("preserves AppError identity from the access-token retry callback", async () => {
    const authorizationExpired = Errors.business(
      401,
      "抖音小程序需要重新授权",
      "DOUYIN_AUTHORIZATION_EXPIRED",
    );
    const client = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 28001008, err_msg: "expired", log_id: "expired-log",
      }),
      retryAccessToken: async () => { throw authorizationExpired; },
    });

    await expect(client.code2Session({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      code: "login-code",
    })).rejects.toBe(authorizationExpired);
  });

  test("validates retrieve authorization code API failures and response shape", async () => {
    for (const fixture of [
      { body: { err_no: 40_001, log_id: "retrieve-error" },
        code: "DOUYIN_OPEN_PLATFORM_API_ERROR" },
      { body: { err_no: 0, log_id: "retrieve-invalid", data: {} },
        code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID" },
    ]) {
      const client = new DouyinOpenPlatformClient({
        fetch: async (_input, _init) => jsonResponse(fixture.body),
      });
      await expect(client.retrieveAuthorizationCode({
        componentAccessToken: COMPONENT_TOKEN,
        authorizationAppId: "authorizer-appid",
      })).rejects.toMatchObject({ code: fixture.code, details: { log_id: fixture.body.log_id } });
    }
  });

  test("maps missing retrieve authorization relationships to stable 401 errors", async () => {
    for (const errNo of [40_004, 40_022]) {
      const client = new DouyinOpenPlatformClient({
        fetch: async (_input, _init) => jsonResponse({
          err_no: errNo, err_msg: `sensitive provider ${errNo}`, log_id: "retrieve-expired-log",
        }),
      });
      let caught: unknown;
      try {
        await client.retrieveAuthorizationCode({
          componentAccessToken: COMPONENT_TOKEN,
          authorizationAppId: "authorizer-appid",
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ statusCode: 401, code: "DOUYIN_AUTHORIZATION_EXPIRED",
        details: { log_id: "retrieve-expired-log" } });
      expect(JSON.stringify(caught)).not.toContain(String(errNo));
    }
  });
});

function authorizerSuccess(): Record<string, unknown> {
  return {
    err_no: 0,
    err_msg: "",
    log_id: "authorizer-log",
    data: {
      authorizer_access_token: AUTHORIZER_TOKEN,
      authorizer_appid: "authorizer-appid",
      authorizer_refresh_token: "refresh-token",
      expires_in: 7200,
      refresh_expires_in: 2_592_000,
      authorize_permission: [{ id: 1, category: "development", description: "permission" }],
    },
  };
}
