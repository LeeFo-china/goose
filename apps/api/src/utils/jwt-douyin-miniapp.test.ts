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
});
