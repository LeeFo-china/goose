import { describe, expect, mock, test } from "bun:test";
import {
  ApiClient,
  ApiRequestError,
  DouyinRequestTransport,
  type ApiOperationClock,
  type TransportInput,
} from "../api/request";
import { captureLaunchContext } from "../platform/launch-context";
import { parseStoredSession } from "../platform/storage";
import type { BootstrapData } from "../models";
import { BootstrapStore } from "./bootstrap";
import { SessionManager, type SessionDependencies } from "./session";

const launchContext = {
  entry_path: "pages/home/index" as const,
  scene: "021001",
  source_type: "direct" as const,
};
const now = 1_800_000_000_000;

function operationClockHarness() {
  let current = 1_000;
  const timers: Array<{ at: number; active: boolean; callback: () => void }> = [];
  const clock: ApiOperationClock = {
    now: () => current,
    schedule(callback, delayMs) {
      const timer = { at: current + delayMs, active: true, callback };
      timers.push(timer);
      return () => { timer.active = false; };
    },
  };
  return {
    clock,
    elapse: (milliseconds: number) => { current += milliseconds; },
    expire: (milliseconds: number) => {
      current += milliseconds;
      for (const timer of timers) {
        if (timer.active && timer.at <= current) {
          timer.active = false;
          timer.callback();
        }
      }
    },
    activeTimers: () => timers.filter((timer) => timer.active).length,
  };
}

function dependencies(overrides: Partial<SessionDependencies> = {}): SessionDependencies {
  return {
    now: () => now,
    readEnvironment: () => ({
      appId: "tt-authorizer-1", envType: "production", version: "1.0.0",
    }),
    readDeploymentConfig: () => ({ deployment_key: "deployment-public-key" }),
    loginOnce: mock(async () => ({ code: "one-time-code" })),
    exchangeSession: mock(async () => ({ accessToken: "fresh-token", expiresIn: 7200 })),
    readStoredSession: mock(() => null),
    writeStoredSession: mock(() => {}),
    clearStoredSession: mock(() => {}),
    ...overrides,
  };
}

describe("Douyin native session state", () => {
  test("cold login exchanges the real app and deployment identifiers, then stores only JWT state", async () => {
    const deps = dependencies();
    const session = new SessionManager(deps);

    await expect(session.initialize(launchContext)).resolves.toBe("fresh-token");
    expect(deps.loginOnce).toHaveBeenCalledTimes(1);
    expect(deps.exchangeSession).toHaveBeenCalledWith({
      app_id: "tt-authorizer-1",
      deployment_key: "deployment-public-key",
      code: "one-time-code",
      launch_context: launchContext,
    });
    expect(deps.writeStoredSession).toHaveBeenCalledWith({
      accessToken: "fresh-token",
      expiresAt: now + 7_200_000,
    });
  });

  test("exchanges an anonymous credential when Douyin has no signed-in host account", async () => {
    const deps = dependencies({
      loginOnce: mock(async () => ({
        anonymousCode: "one-time-anonymous-code",
      })) as never,
    });
    const session = new SessionManager(deps);

    await expect(session.initialize(launchContext)).resolves.toBe("fresh-token");
    expect(deps.exchangeSession).toHaveBeenCalledWith({
      app_id: "tt-authorizer-1",
      deployment_key: "deployment-public-key",
      anonymous_code: "one-time-anonymous-code",
      launch_context: launchContext,
    });
  });

  test("uses a stored unexpired session without invoking tt.login", async () => {
    const deps = dependencies({
      readStoredSession: mock(() => ({ accessToken: "stored-token", expiresAt: now + 60_000 })),
    });

    await expect(new SessionManager(deps).initialize(launchContext)).resolves.toBe("stored-token");
    expect(deps.loginOnce).not.toHaveBeenCalled();
    expect(deps.exchangeSession).not.toHaveBeenCalled();
  });

  test("a 401 refreshes once and retries with the new token", async () => {
    const deps = dependencies({
      readStoredSession: mock(() => ({ accessToken: "old-token", expiresAt: now + 60_000 })),
    });
    const session = new SessionManager(deps);
    await session.initialize(launchContext);
    const send = mock(async (input: TransportInput) => {
      if (input.token === "old-token") {
        throw new ApiRequestError(401, "TOKEN_INVALID", "会话已失效");
      }
      return { ok: true };
    });

    const result = await new ApiClient({ send }, session).request<{ ok: boolean }>({
      path: "/douyin-mini/bootstrap", method: "GET",
    });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(deps.loginOnce).toHaveBeenCalledTimes(1);
    expect(deps.clearStoredSession).toHaveBeenCalledTimes(1);
  });

  test("concurrent 401 responses share one refresh flight", async () => {
    let releaseLogin: () => void = () => {};
    const loginGate = new Promise<void>((resolve) => { releaseLogin = resolve; });
    const loginOnce = mock(async () => { await loginGate; return { code: "one-time-code" }; });
    const deps = dependencies({
      loginOnce,
      readStoredSession: mock(() => ({ accessToken: "old-token", expiresAt: now + 60_000 })),
    });
    const session = new SessionManager(deps);
    await session.initialize(launchContext);
    const send = mock(async (input: TransportInput) => {
      if (input.token === "old-token") {
        throw new ApiRequestError(401, "TOKEN_INVALID", "会话已失效");
      }
      return input.path;
    });
    const client = new ApiClient({ send }, session);

    const first = client.request<string>({ path: "/douyin-mini/company", method: "GET" });
    const second = client.request<string>({ path: "/douyin-mini/cases", method: "GET" });
    await Bun.sleep(0);
    expect(loginOnce).toHaveBeenCalledTimes(1);
    releaseLogin();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "/douyin-mini/company", "/douyin-mini/cases",
    ]);
    expect(deps.exchangeSession).toHaveBeenCalledTimes(1);
  });

  test("failed relogin rejects without retrying or looping", async () => {
    const loginOnce = mock(async () => {
      throw new ApiRequestError(0, "DOUYIN_SESSION_EXCHANGE_FAILED", "login unavailable");
    });
    const deps = dependencies({
      loginOnce,
      readStoredSession: mock(() => ({ accessToken: "old-token", expiresAt: now + 60_000 })),
    });
    const session = new SessionManager(deps);
    await session.initialize(launchContext);
    const send = mock(async () => {
      throw new ApiRequestError(401, "TOKEN_INVALID", "会话已失效");
    });

    await expect(new ApiClient({ send }, session).request({
      path: "/douyin-mini/bootstrap", method: "GET",
    })).rejects.toThrow("login unavailable");
    expect(loginOnce).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("does not refresh again when the one allowed retry also returns 401", async () => {
    const deps = dependencies({
      readStoredSession: mock(() => ({ accessToken: "old-token", expiresAt: now + 60_000 })),
    });
    const session = new SessionManager(deps);
    await session.initialize(launchContext);
    const send = mock(async () => {
      throw new ApiRequestError(401, "TOKEN_INVALID", "会话已失效");
    });

    await expect(new ApiClient({ send }, session).request({
      path: "/douyin-mini/bootstrap", method: "GET",
    })).rejects.toMatchObject({ statusCode: 401, code: "TOKEN_INVALID" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(deps.loginOnce).toHaveBeenCalledTimes(1);
    expect(deps.exchangeSession).toHaveBeenCalledTimes(1);
  });

  test("request transport unwraps data, attaches only bearer auth and clears its timeout", async () => {
    const abort = mock(() => {});
    const requestMock = mock((options: Parameters<typeof tt.request>[0]) => {
      options.success?.({
        errMsg: "request:ok", statusCode: 200, header: {}, data: { data: { ok: true } },
      });
      return { abort };
    });
    const request = requestMock as typeof tt.request;
    const transport = new DouyinRequestTransport("https://api.goodcms.cn", 5, request);

    await expect(transport.send({
      path: "/douyin-mini/bootstrap", method: "GET", token: "signed-jwt",
    })).resolves.toEqual({ ok: true });
    await Bun.sleep(10);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const options = requestMock.mock.calls[0]![0];
    expect(options.url).toBe("https://api.goodcms.cn/douyin-mini/bootstrap");
    expect(options.header).toEqual({
      "content-type": "application/json", authorization: "Bearer signed-jwt",
    });
    expect(options.data).toBeUndefined();
    expect(abort).not.toHaveBeenCalled();
  });

  test("request transport aborts at its deadline and normalizes API failures", async () => {
    const abort = mock(() => {});
    const hangingRequest = mock(() => ({ abort })) as unknown as typeof tt.request;
    const hanging = new DouyinRequestTransport("https://api.goodcms.cn", 2, hangingRequest);

    await expect(hanging.send({ path: "/douyin-mini/company", method: "GET" }))
      .rejects.toMatchObject({ code: "NETWORK_ERROR", statusCode: 0 });
    expect(abort).toHaveBeenCalledTimes(1);

    const rejectedRequest = mock((options: Parameters<typeof tt.request>[0]) => {
      options.success?.({
        errMsg: "request:ok", statusCode: 403, header: {},
        data: { code: "TENANT_NOT_AVAILABLE", message: "装修公司服务已暂停" },
      });
      return { abort: mock(() => {}) };
    }) as typeof tt.request;

    await expect(new DouyinRequestTransport("https://api.goodcms.cn", 10, rejectedRequest)
      .send({ path: "/douyin-mini/company", method: "GET" }))
      .rejects.toMatchObject({
        statusCode: 403,
        code: "TENANT_NOT_AVAILABLE",
        message: "装修公司服务已暂停",
      });
  });

  test("request transport honors a bounded per-call deadline without forwarding it", async () => {
    const abort = mock(() => {});
    const requestMock = mock((options: Parameters<typeof tt.request>[0]) => {
      setTimeout(() => options.success?.({
        errMsg: "request:ok", statusCode: 200, header: {}, data: { data: { ok: true } },
      }), 5);
      return { abort };
    });
    const transport = new DouyinRequestTransport(
      "https://api.goodcms.cn",
      2,
      requestMock as typeof tt.request,
    );

    await expect(transport.send({
      path: "/douyin-mini/budget-estimates/id/ai-analysis",
      method: "POST",
      timeoutMs: 35,
    })).resolves.toEqual({ ok: true });
    const options = requestMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(options).not.toHaveProperty("timeoutMs");
    expect(abort).not.toHaveBeenCalled();

    await expect(transport.send({
      path: "/douyin-mini/bootstrap",
      method: "GET",
      timeoutMs: 60_001,
    })).rejects.toMatchObject({ code: "INVALID_API_CONFIG" });
  });

  test("treats timeoutMs as one operation deadline including a hanging token provider", async () => {
    const harness = operationClockHarness();
    let resolveToken: (token: string) => void = () => {};
    const send = mock(async () => ({ ok: true }));
    const client = new ApiClient(
      { send },
      {
        getAccessToken: () => new Promise<string>((resolve) => { resolveToken = resolve; }),
        refreshAfterUnauthorized: async () => "unused",
      },
      harness.clock,
    );

    const request = client.request({
      path: "/douyin-mini/budget-estimates/id/ai-analysis",
      method: "POST",
      timeoutMs: 35_000,
    });
    harness.expire(35_000);
    await expect(request).rejects.toMatchObject({ code: "NETWORK_ERROR", statusCode: 0 });
    resolveToken("late-token");
    await Bun.sleep(0);
    expect(send).not.toHaveBeenCalled();
    expect(harness.activeTimers()).toBe(0);
  });

  test("passes only remaining operation time through 401 refresh and retry", async () => {
    const harness = operationClockHarness();
    const calls: TransportInput[] = [];
    const client = new ApiClient(
      {
        send: async (input) => {
          calls.push(input);
          if (calls.length === 1) {
            harness.elapse(9_000);
            throw new ApiRequestError(401, "TOKEN_INVALID", "会话已失效");
          }
          return { ok: true };
        },
      },
      {
        getAccessToken: async () => {
          harness.elapse(5_000);
          return "old-token";
        },
        refreshAfterUnauthorized: async () => {
          harness.elapse(7_000);
          return "new-token";
        },
      },
      harness.clock,
    );

    await expect(client.request<{ ok: boolean }>({
      path: "/douyin-mini/budget-estimates/id/ai-analysis",
      method: "POST",
      timeoutMs: 35_000,
    })).resolves.toEqual({ ok: true });
    expect(calls.map((call) => ({ token: call.token, timeoutMs: call.timeoutMs }))).toEqual([
      { token: "old-token", timeoutMs: 30_000 },
      { token: "new-token", timeoutMs: 14_000 },
    ]);
    expect(harness.activeTimers()).toBe(0);
  });

  test("stored session parsing rejects extra fields and launch attribution is allowlisted", () => {
    expect(parseStoredSession({ accessToken: "jwt", expiresAt: now })).toEqual({
      accessToken: "jwt", expiresAt: now,
    });
    expect(parseStoredSession({ accessToken: "jwt", expiresAt: now, tenant_id: "forged" }))
      .toBeNull();

    expect(captureLaunchContext({
      path: "/pages/case-detail/index",
      scene: "021001",
      query: {
        source_type: "short_video",
        campaign_code: "summer-2026",
        content_id: "video-100",
        tenant_id: "forged",
        deployment_key: "forged",
        raw_query: "do-not-copy",
      },
    })).toEqual({
      entry_path: "pages/case-detail/index",
      scene: "021001",
      source_type: "short_video",
      campaign_code: "summer-2026",
      content_id: "video-100",
    });
    expect(captureLaunchContext({
      path: "pages/admin/index", scene: "not-a-scene",
      query: { source_type: "forged", campaign_code: "x".repeat(65) },
    })).toEqual({
      entry_path: "pages/home/index", scene: "0", source_type: "direct",
    });
  });

  test("blocking bootstrap errors navigate to the safe service-unavailable page", async () => {
    const navigateUnavailable = mock(async () => {});
    const store = new BootstrapStore(
      async () => { throw new ApiRequestError(403, "TENANT_NOT_AVAILABLE", "private detail"); },
      navigateUnavailable,
    );

    await expect(store.load()).resolves.toBeNull();
    expect(store.status).toBe("unavailable");
    expect(navigateUnavailable).toHaveBeenCalledWith("TENANT_NOT_AVAILABLE");
  });

  test("joins an in-flight bootstrap refresh instead of exposing stale data", async () => {
    let releaseRefresh: ((value: BootstrapData) => void) | null = null;
    const refreshed = { marker: "new" } as unknown as BootstrapData;
    const initial = { marker: "old" } as unknown as BootstrapData;
    let calls = 0;
    const store = new BootstrapStore(
      async () => {
        calls += 1;
        if (calls === 1) return initial;
        return await new Promise<BootstrapData>((resolve) => { releaseRefresh = resolve; });
      },
      async () => undefined,
    );
    await expect(store.load()).resolves.toBe(initial);

    const refresh = store.load();
    const reader = store.getReadyOrLoad();
    expect(store.status).toBe("loading");
    expect(calls).toBe(2);
    (releaseRefresh as ((value: BootstrapData) => void) | null)?.(refreshed);

    await expect(Promise.all([refresh, reader])).resolves.toEqual([refreshed, refreshed]);
    expect(store.data).toBe(refreshed);
  });
});
