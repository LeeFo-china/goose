import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("WechatMiniProgramAccessTokenProvider", () => {
  test("deduplicates concurrent token requests and caches before expiry", async () => {
    const { WechatMiniProgramAccessTokenProvider } = await import(
      "./wechat-miniprogram-access-token"
    );
    const getSecretString = mock(async (key: string) =>
      key === "WECHAT_APPID" ? "app-id" : "app-secret"
    );
    const fetchImpl = mock(async () => new Response(JSON.stringify({
      access_token: "access-token",
      expires_in: 7200,
    }), { status: 200 }));
    const provider = new WechatMiniProgramAccessTokenProvider({
      settingsService: { getSecretString },
      fetchImpl,
      nowFactory: () => 1_000,
    });

    expect(await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
    ])).toEqual(["access-token", "access-token"]);
    expect(await provider.getAccessToken()).toBe("access-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(getSecretString).toHaveBeenCalledTimes(2);
  });

  test.each(["AbortError", "TimeoutError"])(
    "wraps %s as a stable timeout error",
    async (name) => {
      const { WechatMiniProgramAccessTokenProvider } = await import(
        "./wechat-miniprogram-access-token"
      );
      const failure = Object.assign(new TypeError("private fetch detail"), {
        name,
      });
      const provider = new WechatMiniProgramAccessTokenProvider({
        settingsService: { getSecretString: mock(async () => "configured") },
        fetchImpl: mock(async () => Promise.reject(failure)),
      });

      await expect(provider.getAccessToken()).rejects.toMatchObject({
        statusCode: 504,
        code: "WECHAT_MINIPROGRAM_ACCESS_TOKEN_TIMEOUT",
      });
    },
  );

  test("wraps a transport rejection without exposing its message", async () => {
    const { WechatMiniProgramAccessTokenProvider } = await import(
      "./wechat-miniprogram-access-token"
    );
    const provider = new WechatMiniProgramAccessTokenProvider({
      settingsService: { getSecretString: mock(async () => "configured") },
      fetchImpl: mock(async () =>
        Promise.reject(new TypeError("private network detail"))
      ),
    });

    try {
      await provider.getAccessToken();
      throw new TypeError("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 502,
        code: "WECHAT_MINIPROGRAM_ACCESS_TOKEN_TRANSPORT_FAILED",
      });
      expect(String(error)).not.toContain("private network detail");
    }
  });

  test("aborts a half-open token request at the configured test timeout", async () => {
    const { WechatMiniProgramAccessTokenProvider } = await import(
      "./wechat-miniprogram-access-token"
    );
    const fetchImpl = mock(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new TypeError("missing timeout signal"));
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    }));
    const provider = new WechatMiniProgramAccessTokenProvider({
      settingsService: { getSecretString: mock(async () => "configured") },
      fetchImpl,
      requestTimeoutMs: 1,
    });

    await expect(provider.getAccessToken()).rejects.toMatchObject({
      statusCode: 504,
      code: "WECHAT_MINIPROGRAM_ACCESS_TOKEN_TIMEOUT",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("returns a bounded stable error without provider text", async () => {
    const { WechatMiniProgramAccessTokenProvider } = await import(
      "./wechat-miniprogram-access-token"
    );
    const provider = new WechatMiniProgramAccessTokenProvider({
      settingsService: { getSecretString: mock(async () => "configured") },
      fetchImpl: mock(async () => new Response(JSON.stringify({
        errcode: 40013,
        errmsg: "private provider diagnostic",
      }), { status: 200 })),
    });

    try {
      await provider.getAccessToken();
      throw new TypeError("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 502,
        code: "WECHAT_MINIPROGRAM_ACCESS_TOKEN_REJECTED",
        details: { httpStatus: 200, wechatErrcode: 40013 },
      });
      expect(String(error)).not.toContain("private provider diagnostic");
    }
  });
});
