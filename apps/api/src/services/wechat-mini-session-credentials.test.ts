import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { UserOAuthIdentityRecord } from "@/repositories/user-identities";
import type {
  WechatMiniSessionCredentialRecord,
} from "@/repositories/wechat-mini-session-credentials";

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      rpc: mock(async () => ({ data: null, error: null })),
    }),
  },
}));

const ENV_NAME = "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1";
const OAUTH_IDENTITY_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const OPENID = "openid-for-test";

function oauthIdentity(
  overrides: Partial<UserOAuthIdentityRecord> = {},
): UserOAuthIdentityRecord {
  return {
    id: OAUTH_IDENTITY_ID,
    user_id: USER_ID,
    platform: "wechat_mini",
    openid: OPENID,
    unionid: null,
    status: "active",
    bound_at: "2026-07-31T13:10:00.000Z",
    unbound_at: null,
    created_at: "2026-07-31T13:10:00.000Z",
    updated_at: "2026-07-31T13:10:00.000Z",
    ...overrides,
  };
}

function credential(
  overrides: Partial<WechatMiniSessionCredentialRecord> = {},
): WechatMiniSessionCredentialRecord {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    oauth_identity_id: OAUTH_IDENTITY_ID,
    openid_hash: "0".repeat(64),
    encrypted_session_key: "encrypted-value",
    encryption_key_version: 1,
    session_revision: 1,
    status: "active",
    obtained_at: "2026-07-31T13:10:00.000Z",
    last_used_at: null,
    invalidated_at: null,
    created_at: "2026-07-31T13:10:00.000Z",
    updated_at: "2026-07-31T13:10:00.000Z",
    ...overrides,
  };
}

async function createHarness() {
  const { WechatMiniSessionCredentialService } = await import(
    "./wechat-mini-session-credentials"
  );
  let revision = 0;
  const identityRepository = {
    findActiveOauthIdentity: mock(async () => oauthIdentity()),
  };
  const credentialRepository = {
    rotate: mock(async (input: {
      oauthIdentityId: string;
      userId: string;
      openid: string;
      openidHash: string;
      encryptedSessionKey: string;
      encryptionKeyVersion: number;
    }) => credential({
      encrypted_session_key: input.encryptedSessionKey,
      openid_hash: input.openidHash,
      session_revision: ++revision,
    })),
    findLatestForOauthIdentity: mock(async () => null as WechatMiniSessionCredentialRecord | null),
    markUsed: mock(async () => true),
    invalidate: mock(async () => credential({ status: "invalid" })),
    revokeForOauthIdentity: mock(async () => [credential({ status: "revoked" })]),
  };

  return {
    identityRepository,
    credentialRepository,
    service: new WechatMiniSessionCredentialService({
      identityRepository,
      credentialRepository,
    }),
  };
}

describe("WechatMiniSessionCredentialService", () => {
  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  test("rotates the same OAuth identity to revision 2 without returning plaintext", async () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";
    const { credentialRepository, service } = await createHarness();

    const first = await service.rotateForLogin({
      userId: USER_ID,
      openid: OPENID,
      sessionKey: "first-session-key",
    });
    const second = await service.rotateForLogin({
      userId: USER_ID,
      openid: OPENID,
      sessionKey: "second-session-key",
    });

    expect(first.sessionRevision).toBe(1);
    expect(second.sessionRevision).toBe(2);
    expect(JSON.stringify([first, second])).not.toContain("session-key");
    expect(credentialRepository.rotate.mock.calls[1]?.[0])
      .not.toHaveProperty("sessionKey");
    expect(credentialRepository.rotate.mock.calls[1]?.[0].encryptedSessionKey)
      .not.toContain("second-session-key");
  });

  test("requires a refreshed login when no credential exists", async () => {
    const { service } = await createHarness();

    expect(service.getActiveForUser({
      userId: USER_ID,
      openid: OPENID,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    });
  });

  test.each(["invalid", "revoked"] as const)(
    "requires a refreshed login when the credential is %s",
    async (status) => {
      const { credentialRepository, service } = await createHarness();
      credentialRepository.findLatestForOauthIdentity.mockResolvedValueOnce(
        credential({ status }),
      );

      expect(service.getActiveForUser({
        userId: USER_ID,
        openid: OPENID,
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      });
    },
  );

  test("requires a refreshed login when rotation wins the read-to-touch race", async () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";
    const { credentialRepository, service } = await createHarness();
    const { encryptWechatMiniSessionKey } = await import(
      "./wechat-mini-session-crypto"
    );
    credentialRepository.findLatestForOauthIdentity.mockResolvedValueOnce(
      credential({
        encrypted_session_key: encryptWechatMiniSessionKey("stale-session-key", 1),
      }),
    );
    credentialRepository.markUsed.mockResolvedValueOnce(false);

    await expect(service.getActiveForUser({
      userId: USER_ID,
      openid: OPENID,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    });
    expect(credentialRepository.findLatestForOauthIdentity).toHaveBeenCalledWith({
      oauthIdentityId: OAUTH_IDENTITY_ID,
      userId: USER_ID,
      openid: OPENID,
    });
    expect(credentialRepository.markUsed).toHaveBeenCalledWith({
      credentialId: credential().id,
      sessionRevision: 1,
      userId: USER_ID,
      openid: OPENID,
    });
  });

  test("rejects credential reads for an OAuth identity owned by another user", async () => {
    const { credentialRepository, identityRepository, service } = await createHarness();
    identityRepository.findActiveOauthIdentity.mockResolvedValueOnce(
      oauthIdentity({ user_id: "00000000-0000-4000-8000-000000000099" }),
    );

    await expect(service.getActiveForUser({
      userId: USER_ID,
      openid: OPENID,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    });
    expect(credentialRepository.findLatestForOauthIdentity).not.toHaveBeenCalled();
  });

  test("marks a server-rejected session invalid", async () => {
    const { credentialRepository, service } = await createHarness();

    const invalidated = await service.invalidate({
      userId: USER_ID,
      openid: OPENID,
      credentialId: credential().id,
      sessionRevision: 1,
    });

    expect(invalidated.status).toBe("invalid");
    expect(credentialRepository.invalidate).toHaveBeenCalledWith({
      userId: USER_ID,
      openid: OPENID,
      credentialId: credential().id,
      sessionRevision: 1,
    });
  });

  test("rejects invalidation for an OAuth identity owned by another user", async () => {
    const { credentialRepository, identityRepository, service } = await createHarness();
    identityRepository.findActiveOauthIdentity.mockResolvedValueOnce(
      oauthIdentity({ user_id: "00000000-0000-4000-8000-000000000099" }),
    );

    await expect(service.invalidate({
      userId: USER_ID,
      openid: OPENID,
      credentialId: credential().id,
      sessionRevision: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    });
    expect(credentialRepository.invalidate).not.toHaveBeenCalled();
  });

  test("revokes credentials explicitly when an OAuth identity is unbound", async () => {
    const { credentialRepository, service } = await createHarness();

    const revoked = await service.revokeForOauthIdentity(OAUTH_IDENTITY_ID);

    expect(revoked).toBe(1);
    expect(credentialRepository.revokeForOauthIdentity)
      .toHaveBeenCalledWith(OAUTH_IDENTITY_ID);
  });

  test("keeps database and login integration on the narrow credential boundary", () => {
    const migration = readFileSync(new URL(
      "../../../../supabase/migrations/20260731131000_create_wechat_mini_session_credentials.sql",
      import.meta.url,
    ), "utf8");
    const loginSource = readFileSync(new URL(
      "./wechat-auth-legacy/login.ts",
      import.meta.url,
    ), "utf8");
    const identityServiceSource = readFileSync(new URL(
      "./user-identities.ts",
      import.meta.url,
    ), "utf8");

    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("encryption_key_version integer NOT NULL");
    expect(migration).not.toMatch(/\bkey_version\b/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE)[\s\S]+TO service_role/);
    expect(migration).toMatch(/rotate_wechat_mini_session_credential[\s\S]+SECURITY DEFINER[\s\S]+FOR UPDATE/);
    expect(migration).toMatch(/OLD\.status = 'active'[\s\S]+NEW\.status IN \('disabled', 'unbound'\)/);
    expect(loginSource).toContain("wechatMiniSessionCredentialService.rotateForLogin");
    expect(identityServiceSource).toContain("revokeForOauthIdentity");
  });
});
