import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const restorers: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()?.mockRestore();
  }
});

describe("UserIdentityService WeChat session revocation", () => {
  test("explicitly revokes the credential through the real OAuth unbind service", async () => {
    const oauthIdentityId = "00000000-0000-4000-8000-000000000701";
    const userId = "00000000-0000-4000-8000-000000000702";
    const openid = "unbind-openid";
    const { userIdentityRepository } = await import(
      "@/repositories/user-identities"
    );
    const { wechatMiniSessionCredentialService } = await import(
      "./wechat-mini-session-credentials"
    );
    const unbind = spyOn(userIdentityRepository, "unbindOauthIdentities")
      .mockResolvedValue([{ id: oauthIdentityId }]);
    const recordEvent = spyOn(userIdentityRepository, "recordAuthEvent")
      .mockResolvedValue({} as never);
    const revoke = spyOn(
      wechatMiniSessionCredentialService,
      "revokeForOauthIdentity",
    ).mockResolvedValue(1);
    restorers.push(unbind, recordEvent, revoke);
    const { userIdentityService } = await import("./user-identities");

    await userIdentityService.unbindOauthIdentityBestEffort({
      userId,
      platform: "wechat_mini",
      openid,
      source: "test_explicit_session_revoke",
    });

    expect(unbind).toHaveBeenCalledWith({
      userId,
      platform: "wechat_mini",
      openid,
    });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(oauthIdentityId);
  });
});
