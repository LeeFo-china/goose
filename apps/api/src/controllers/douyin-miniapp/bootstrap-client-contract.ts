import type { DouyinBootstrapFeatureContract } from
  "@/services/douyin-miniapp/bootstrap-feature-contract";

const DOUYIN_REFERER_HOST = "tmaservice.developer.toutiao.com";
const LEGACY_APP_ID = "ttd033a68e4e56ccd301";
const LEGACY_VERSION = "0.1.10";

export function resolveDouyinBootstrapFeatureContract(
  rawReferer: unknown,
  authenticatedAppId: string | undefined,
): DouyinBootstrapFeatureContract {
  if (typeof rawReferer !== "string") return "runtime";
  try {
    const referer = new URL(rawReferer);
    const appId = referer.searchParams.get("appid");
    const version = referer.searchParams.get("version");
    return referer.protocol === "https:"
      && referer.hostname === DOUYIN_REFERER_HOST
      && appId === LEGACY_APP_ID
      && appId === authenticatedAppId
      && version === LEGACY_VERSION
      ? "legacy_0_1_10"
      : "runtime";
  } catch {
    return "runtime";
  }
}
