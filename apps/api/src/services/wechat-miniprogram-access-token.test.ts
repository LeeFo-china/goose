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
    expect(getSecretString).toHaveBeenCalledTimes(2);
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
