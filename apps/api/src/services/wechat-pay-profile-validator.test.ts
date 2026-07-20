import { beforeEach, describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type {
  PlatformPaymentMerchantMode,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const rsaKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const ecKeys = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

const validBundle = {
  privateKeyPem: rsaKeys.privateKey,
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: rsaKeys.publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
};
const load = mock(async (): Promise<WechatPaySecretBundle> => validBundle);
const probe = mock(async () => ({
  ok: true as const,
  probe_mode: "wechat_pay_public_key" as const,
  api_v3_key_probe: "format_only" as const,
  request_id: "wechat-request-id",
}));

function config(
  profileCode: PlatformPaymentProfileCode = "platform_direct_recharge",
  merchantMode: PlatformPaymentMerchantMode = "direct_merchant",
) {
  return {
    profile_code: profileCode,
    merchant_mode: merchantMode,
    merchant_id: "1561816121",
    serial_no: "MERCHANT_CERT_SERIAL",
    encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
    secret_bundle_revision: "bundle-revision-1",
    notify_url: "https://api.example.com/pay/wechat/callback",
  };
}

async function createValidator() {
  const { WechatPayProfileValidator } = await import(
    "./wechat-pay-profile-validator"
  );
  return new WechatPayProfileValidator({
    secretBundleService: { load },
    gateway: { probe },
  });
}

describe("WechatPayProfileValidator", () => {
  beforeEach(() => {
    load.mockClear();
    probe.mockClear();
    load.mockImplementation(async () => validBundle);
  });

  test.each([
    ["platform_direct_recharge", "direct_merchant"],
    ["tenant_service_provider", "service_provider_sub_merchant"],
  ] as const)("validates the %s APIv3 profile", async (profileCode, mode) => {
    const validator = await createValidator();

    const result = await validator.validate(config(profileCode, mode));

    expect(result.ok).toBe(true);
    expect(load).toHaveBeenCalledWith(
      "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
    );
    expect(probe).toHaveBeenCalledWith({
      merchantId: "1561816121",
      serialNo: "MERCHANT_CERT_SERIAL",
      privateKeyPem: rsaKeys.privateKey,
      apiV3Key: "12345678901234567890123456789012",
      wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
      wechatPayPublicKeyPem: rsaKeys.publicKey.trim(),
      baseUrl: "https://api.mch.weixin.qq.com",
    });
  });

  test.each([
    ["merchant_id", "WECHAT_PAY_MERCHANT_ID_REQUIRED"],
    ["serial_no", "WECHAT_PAY_SERIAL_NO_REQUIRED"],
    ["encrypted_config_ref", "WECHAT_PAY_SECRET_REF_REQUIRED"],
  ] as const)("rejects a missing %s", async (field, expectedCode) => {
    const validator = await createValidator();
    const input = { ...config(), [field]: " " };

    await expect(validator.validate(input)).rejects.toMatchObject({
      statusCode: 409,
      code: expectedCode,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  test("rejects a non-HTTPS callback URL", async () => {
    const validator = await createValidator();

    await expect(
      validator.validate({
        ...config(),
        notify_url: "http://api.example.com/pay/wechat/callback",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_NOTIFY_URL_INVALID",
    });
    expect(load).not.toHaveBeenCalled();
  });

  test("requires the platform profile to declare a secret bundle revision", async () => {
    const validator = await createValidator();

    await expect(validator.validate({
      ...config(),
      secret_bundle_revision: " ",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_REVISION_REQUIRED",
    });
    expect(load).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  test.each([
    [null, "WECHAT_PAY_SECRET_BUNDLE_REVISION_REQUIRED"],
    ["different-revision", "WECHAT_PAY_SECRET_BUNDLE_REVISION_MISMATCH"],
  ])(
    "rejects a secret bundle whose revision does not match the profile: %s",
    async (revision, expectedCode) => {
      load.mockImplementationOnce(async () => ({ ...validBundle, revision }));
      const validator = await createValidator();

      await expect(validator.validate(config())).rejects.toMatchObject({
        statusCode: 409,
        code: expectedCode,
      });
      expect(probe).not.toHaveBeenCalled();
    },
  );

  test("rejects an APIv3 key that is not exactly 32 bytes", async () => {
    load.mockImplementationOnce(async () => ({
      ...validBundle,
      apiV3Key: "short-api-v3-key",
    }));
    const validator = await createValidator();

    await expect(validator.validate(config())).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_API_V3_KEY_INVALID",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  test("rejects a merchant private key that is not RSA", async () => {
    load.mockImplementationOnce(async () => ({
      ...validBundle,
      privateKeyPem: ecKeys.privateKey,
    }));
    const validator = await createValidator();

    await expect(validator.validate(config())).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PRIVATE_KEY_INVALID",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  test.each([
    [null, rsaKeys.publicKey],
    ["PUB_KEY_ID_TEST", null],
  ] as const)(
    "requires both the WeChat Pay public key id and PEM",
    async (publicKeyId, publicKeyPem) => {
      load.mockImplementationOnce(async () => ({
        ...validBundle,
        wechatPayPublicKeyId: publicKeyId,
        wechatPayPublicKeyPem: publicKeyPem,
      }));
      const validator = await createValidator();

      await expect(validator.validate(config())).rejects.toMatchObject({
        statusCode: 409,
        code: "WECHAT_PAY_PUBLIC_KEY_REQUIRED",
      });
      expect(probe).not.toHaveBeenCalled();
    },
  );

  test("rejects a WeChat Pay public key that is not RSA", async () => {
    load.mockImplementationOnce(async () => ({
      ...validBundle,
      wechatPayPublicKeyPem: ecKeys.publicKey,
    }));
    const validator = await createValidator();

    await expect(validator.validate(config())).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PUBLIC_KEY_INVALID",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  test.each([
    "http://api.mch.weixin.qq.com",
    "https://api.mch.weixin.qq.com.evil.example",
    "https://evil.example",
    "https://user:password@api.mch.weixin.qq.com",
    "https://api.mch.weixin.qq.com:444",
    "https://api.mch.weixin.qq.com/v3/certificates",
    "https://api.mch.weixin.qq.com?target=evil",
    "https://api.mch.weixin.qq.com#fragment",
  ])("rejects non-official WeChat Pay API base URL %s", async (baseUrl) => {
    load.mockImplementationOnce(async () => ({ ...validBundle, baseUrl }));
    const validator = await createValidator();

    await expect(validator.validate(config())).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_BASE_URL_INVALID",
    });
    expect(probe).not.toHaveBeenCalled();
  });

  test("allows the official backup origin and normalizes its trailing slash", async () => {
    load.mockImplementationOnce(async () => ({
      ...validBundle,
      baseUrl: "https://api2.mch.weixin.qq.com/",
    }));
    const validator = await createValidator();

    await validator.validate(config());

    expect(probe).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: "https://api2.mch.weixin.qq.com",
    }));
  });
});
