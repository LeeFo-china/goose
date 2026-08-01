import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let rpcError: unknown = null;
const rpc = mock(async () => ({ data: null, error: rpcError }));

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ rpc }),
  },
}));

const rotateInput = {
  oauthIdentityId: "00000000-0000-4000-8000-000000000801",
  userId: "00000000-0000-4000-8000-000000000802",
  openid: "repository-openid",
  openidHash: "0".repeat(64),
  encryptedSessionKey: "wmss:v1:1:iv:tag:ciphertext",
  encryptionKeyVersion: 1,
};

describe("WechatMiniSessionCredentialRepository rotation errors", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpcError = null;
  });

  test("maps only the exact identity mismatch to refresh-required 409", async () => {
    rpcError = {
      code: "P0001",
      message: "WECHAT_MINI_SESSION_IDENTITY_MISMATCH",
      details: "private database context",
      hint: "",
    };
    const { WechatMiniSessionCredentialRepository } = await import(
      "./wechat-mini-session-credentials"
    );

    await expect(
      new WechatMiniSessionCredentialRepository().rotate(rotateInput),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      details: undefined,
    });
  });

  test.each([
    {
      code: "P0001",
      message: "WECHAT_MINI_SESSION_ROTATION_INPUT_INVALID",
    },
    {
      code: "P0001",
      message: "another error",
      details: "WECHAT_MINI_SESSION_IDENTITY_MISMATCH",
    },
    {
      code: "XX000",
      message: "unknown database failure",
    },
  ])("keeps non-matching database errors as 500: $message", async (error) => {
    rpcError = error;
    const { WechatMiniSessionCredentialRepository } = await import(
      "./wechat-mini-session-credentials"
    );

    await expect(
      new WechatMiniSessionCredentialRepository().rotate(rotateInput),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });
});
