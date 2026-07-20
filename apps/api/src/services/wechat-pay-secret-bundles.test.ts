import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function createService() {
  const { WechatPaySecretBundleService } = await import(
    "./wechat-pay-secret-bundles"
  );
  return { WechatPaySecretBundleService };
}

describe("WechatPaySecretBundleService", () => {
  test("loads secret bundle from environment reference", async () => {
    process.env.WECHAT_PAY_TEST_BUNDLE = JSON.stringify({
      private_key_pem: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----",
      api_v3_key: "api-v3-key",
      wechat_pay_public_key_id: "PUB_KEY_ID_TEST",
      wechat_pay_public_key_pem: "public-key",
      base_url: "https://api.mch.weixin.qq.com",
      revision: "bundle-revision-1",
    });
    const { WechatPaySecretBundleService } = await createService();
    const service = new WechatPaySecretBundleService({
      settingsService: {
        getSecretString: mock(async () => ""),
      },
    });

    const bundle = await service.load("env://WECHAT_PAY_TEST_BUNDLE");

    expect(bundle).toEqual({
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----",
      apiV3Key: "api-v3-key",
      wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
      wechatPayPublicKeyPem: "public-key",
      baseUrl: "https://api.mch.weixin.qq.com",
      revision: "bundle-revision-1",
    });
    delete process.env.WECHAT_PAY_TEST_BUNDLE;
  });

  test("loads secret bundle from system setting reference", async () => {
    const getSecretString = mock(async (key: string) => {
      expect(key).toBe("WECHAT_PAY_TENANT_1");
      return JSON.stringify({
        private_key_pem: "private-key",
        api_v3_key: "api-v3-key",
      });
    });
    const { WechatPaySecretBundleService } = await createService();
    const service = new WechatPaySecretBundleService({
      settingsService: { getSecretString },
    });

    const bundle = await service.load("secret://WECHAT_PAY_TENANT_1");

    expect(bundle).toMatchObject({
      privateKeyPem: "private-key",
      apiV3Key: "api-v3-key",
      revision: null,
    });
    expect(getSecretString).toHaveBeenCalledWith("WECHAT_PAY_TENANT_1");
  });

  test("parses an optional opaque bundle revision without breaking legacy bundles", async () => {
    const getSecretString = mock(async () => JSON.stringify({
      private_key_pem: "private-key",
      api_v3_key: "api-v3-key",
      revision: "  revision-20260720  ",
    }));
    const { WechatPaySecretBundleService } = await createService();
    const service = new WechatPaySecretBundleService({
      settingsService: { getSecretString },
    });

    const bundle = await service.load("setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE");

    expect(bundle.revision).toBe("revision-20260720");
  });

  test("rejects missing or malformed secret bundle without leaking values", async () => {
    const { WechatPaySecretBundleService } = await createService();
    const service = new WechatPaySecretBundleService({
      settingsService: {
        getSecretString: mock(async () => "{\"private_key_pem\":\"key\"}"),
      },
    });

    await expect(service.load("setting://WECHAT_PAY_BAD")).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_INVALID",
    });
  });
});
