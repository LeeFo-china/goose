import { describe, expect, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import { requireMatchingPlatformPaymentSecretBundle } from "./platform-payment-secret-bundle-revision";

const config = {
  secret_bundle_revision: "bundle-revision-1",
} satisfies Pick<PlatformPaymentConfigRecord, "secret_bundle_revision">;

const bundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
} satisfies WechatPaySecretBundle;

describe("requireMatchingPlatformPaymentSecretBundle", () => {
  test("returns a bundle whose revision exactly matches the platform config", () => {
    const result = requireMatchingPlatformPaymentSecretBundle(config, bundle);

    expect(result).toBe(bundle);
    expect(result.revision).toBe("bundle-revision-1");
  });

  test("rejects a platform bundle without a revision", () => {
    expect(() => requireMatchingPlatformPaymentSecretBundle(config, {
      ...bundle,
      revision: null,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_REVISION_REQUIRED",
    }));
  });

  test("rejects a platform bundle with a different revision", () => {
    expect(() => requireMatchingPlatformPaymentSecretBundle(config, {
      ...bundle,
      revision: "bundle-revision-2",
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_REVISION_MISMATCH",
    }));
  });
});
