import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

type PlatformPaymentSecretRevisionConfig = Pick<
  PlatformPaymentConfigRecord,
  "secret_bundle_revision"
>;

export type RevisionBoundWechatPaySecretBundle = WechatPaySecretBundle & {
  revision: string;
};

const REVISION_REQUIRED_CODE = "WECHAT_PAY_SECRET_BUNDLE_REVISION_REQUIRED";
const REVISION_MISMATCH_CODE = "WECHAT_PAY_SECRET_BUNDLE_REVISION_MISMATCH";

export function requireMatchingPlatformPaymentSecretBundle(
  config: PlatformPaymentSecretRevisionConfig,
  bundle: WechatPaySecretBundle,
): RevisionBoundWechatPaySecretBundle {
  const configRevision = config.secret_bundle_revision;
  const bundleRevision = bundle.revision;
  if (
    typeof configRevision !== "string" ||
    !configRevision.trim() ||
    typeof bundleRevision !== "string" ||
    !bundleRevision.trim()
  ) {
    throw Errors.business(
      409,
      "微信支付密钥版本未配置",
      REVISION_REQUIRED_CODE,
    );
  }
  if (configRevision !== bundleRevision) {
    throw Errors.business(
      409,
      "微信支付密钥版本与支付配置不匹配",
      REVISION_MISMATCH_CODE,
    );
  }
  return bundle as RevisionBoundWechatPaySecretBundle;
}

export function isPlatformPaymentSecretBundleRevisionError(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    !("statusCode" in error)
  ) return false;
  const { code, statusCode } = error as {
    code?: unknown;
    statusCode?: unknown;
  };
  if (statusCode !== 409) return false;
  return code === REVISION_REQUIRED_CODE || code === REVISION_MISMATCH_CODE;
}
