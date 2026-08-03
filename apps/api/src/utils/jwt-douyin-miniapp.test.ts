import { beforeAll, describe, expect, test } from "bun:test";

process.env.JWT_SECRET = "douyin-session-jwt-secret-at-least-32-bytes";

let jwt: typeof import("./jwt");

beforeAll(async () => {
  jwt = await import("./jwt");
});

const payload = {
  tenant_id: "33333333-3333-4333-8333-333333333333",
  douyin_installation_id: "22222222-2222-4222-8222-222222222222",
  douyin_app_id: "tt-authorizer-1",
  subject_hash: "a".repeat(64),
};

describe("Douyin miniapp JWT", () => {
  test("signs a tenant-bound two-hour session without raw Douyin identity", () => {
    const token = jwt.signDouyinMiniappToken(payload);
    const result = jwt.verifyTokenDetailed(token);

    expect(result.reason).toBe("valid");
    expect(result.payload).toMatchObject({
      ...payload,
      sub: payload.subject_hash,
      token_type: "douyin_miniapp",
      login_channel: "douyin",
    });
    expect(result.payload!.exp! - result.payload!.iat!).toBe(7200);
    expect(JSON.stringify(result.payload)).not.toMatch(/openid|open_id|session_key/i);
  });

  test("honors the dedicated session expiry setting", () => {
    process.env.DOUYIN_MINIAPP_SESSION_EXPIRES_IN = "30m";
    try {
      const result = jwt.verifyTokenDetailed(jwt.signDouyinMiniappToken(payload));
      expect(result.payload!.exp! - result.payload!.iat!).toBe(1800);
      expect(jwt.getDouyinMiniappTokenExpiresInSeconds()).toBe(1800);
    } finally {
      delete process.env.DOUYIN_MINIAPP_SESSION_EXPIRES_IN;
    }
  });

  test("falls back to the two-hour Douyin session lifetime for unsafe settings", () => {
    for (const unsafeValue of ["invalid", "0", "0s", "-1", "25h", "999999999"]) {
      process.env.DOUYIN_MINIAPP_SESSION_EXPIRES_IN = unsafeValue;
      const result = jwt.verifyTokenDetailed(jwt.signDouyinMiniappToken(payload));

      expect(result.payload!.exp! - result.payload!.iat!).toBe(7200);
      expect(jwt.getDouyinMiniappTokenExpiresInSeconds()).toBe(7200);
    }
    delete process.env.DOUYIN_MINIAPP_SESSION_EXPIRES_IN;
  });

  test("rejects a signed Douyin token when any required claim is absent or inconsistent", () => {
    const complete = {
      ...payload,
      sub: payload.subject_hash,
      token_type: "douyin_miniapp",
      login_channel: "douyin",
    } as const;
    const invalidPayloads = [
      { ...complete, sub: undefined },
      { ...complete, tenant_id: undefined },
      { ...complete, douyin_installation_id: undefined },
      { ...complete, douyin_app_id: undefined },
      { ...complete, subject_hash: undefined },
      { ...complete, subject_hash: "b".repeat(64) },
      { ...complete, login_channel: "wechat" },
    ];

    for (const invalid of invalidPayloads) {
      const token = jwt.signToken(invalid as never);
      expect(jwt.verifyTokenDetailed(token)).toMatchObject({
        payload: null,
        reason: "invalid",
      });
    }
  });

  test("rejects signed Douyin payloads with raw identity or cross-domain claims", () => {
    const complete = {
      ...payload,
      sub: payload.subject_hash,
      token_type: "douyin_miniapp",
      login_channel: "douyin",
      roles: ["douyin_miniapp"],
    } as const;
    const invalidPayloads = [
      { ...complete, openid: "raw-openid" },
      { ...complete, unionid: "raw-unionid" },
      { ...complete, employee_id: "44444444-4444-4444-8444-444444444444" },
      { ...complete, customer_id: "55555555-5555-4555-8555-555555555555" },
      { ...complete, roles: ["platform_admin"] },
      { ...complete, roles: ["douyin_miniapp", "platform_admin"] },
    ];

    for (const invalid of invalidPayloads) {
      expect(jwt.verifyTokenDetailed(jwt.signToken(invalid as never))).toMatchObject({
        payload: null,
        reason: "invalid",
      });
    }
  });

  test("rejects a Douyin session issued too far in the future", () => {
    const realNow = Date.now;
    let token: string;
    try {
      Date.now = () => realNow() + 5 * 60 * 1000;
      token = jwt.signDouyinMiniappToken(payload);
    } finally {
      Date.now = realNow;
    }

    expect(jwt.verifyTokenDetailed(token!)).toMatchObject({
      payload: null,
      reason: "invalid",
    });
  });
});
