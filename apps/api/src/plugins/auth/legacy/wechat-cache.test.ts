import { describe, expect, mock, test } from "bun:test";
import { signToken, verifyToken } from "@/utils/jwt";
import * as wechatCache from "./wechat-cache";

process.env.JWT_SECRET ??= "test-jwt-secret";

describe("WeChat identity check cache invalidation", () => {
  test("forces a fresh identity check for the unbound auth user and openid", async () => {
    const token = signToken({
      sub: "00000000-0000-4000-8000-000000000401",
      openid: "wx-customer-openid",
      login_channel: "wechat",
      roles: ["customer"],
      tenant_id: "00000000-0000-4000-8000-000000000201",
      customer_id: "00000000-0000-4000-8000-000000000301",
    });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    if (!payload) return;

    wechatCache.primeWechatIdentityCheckCacheFromToken(token);
    const cacheKey = wechatCache.buildWechatIdentityCheckCacheKey(
      "binding",
      payload,
    );
    const cachedHandler = mock(async () => "cached");

    expect(
      await wechatCache.runWechatIdentityCheckOnce(
        cacheKey,
        payload,
        cachedHandler,
      ),
    ).toBeUndefined();
    expect(cachedHandler).not.toHaveBeenCalled();

    const invalidateWechatIdentityCheckCache = Reflect.get(
      wechatCache,
      "invalidateWechatIdentityCheckCache",
    ) as
      | ((input: { authUserId: string; openid: string }) => void)
      | undefined;
    expect(invalidateWechatIdentityCheckCache).toBeFunction();
    if (!invalidateWechatIdentityCheckCache) return;

    invalidateWechatIdentityCheckCache({
      authUserId: payload.sub!,
      openid: payload.openid!,
    });

    const freshHandler = mock(async () => "fresh");
    expect(
      await wechatCache.runWechatIdentityCheckOnce(
        cacheKey,
        payload,
        freshHandler,
      ),
    ).toBe("fresh");
    expect(freshHandler).toHaveBeenCalledTimes(1);
  });

  test("does not recache a check that completed after invalidation", async () => {
    const token = signToken({
      sub: "00000000-0000-4000-8000-000000000402",
      openid: "wx-concurrent-openid",
      login_channel: "wechat",
      roles: ["customer"],
      tenant_id: "00000000-0000-4000-8000-000000000202",
      customer_id: "00000000-0000-4000-8000-000000000302",
    });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    if (!payload) return;

    const cacheKey = wechatCache.buildWechatIdentityCheckCacheKey(
      "binding",
      payload,
    );
    let resolveStaleCheck: ((value: string) => void) | undefined;
    const staleHandler = mock(
      () =>
        new Promise<string>((resolve) => {
          resolveStaleCheck = resolve;
        }),
    );
    const staleRequest = wechatCache.runWechatIdentityCheckOnce(
      cacheKey,
      payload,
      staleHandler,
    );

    wechatCache.invalidateWechatIdentityCheckCache({
      authUserId: payload.sub!,
      openid: payload.openid!,
    });
    resolveStaleCheck?.("stale");
    expect(await staleRequest).toBe("stale");

    const freshHandler = mock(async () => "fresh");
    expect(
      await wechatCache.runWechatIdentityCheckOnce(
        cacheKey,
        payload,
        freshHandler,
      ),
    ).toBe("fresh");
    expect(freshHandler).toHaveBeenCalledTimes(1);
  });
});
