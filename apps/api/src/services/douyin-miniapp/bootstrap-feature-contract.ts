import type { DouyinRuntimeConfig } from "@/schema/platform-douyin-miniapps";

export type DouyinBootstrapFeatureContract = "legacy_0_1_10" | "runtime";

export type DouyinBootstrapOptions = {
  readonly featureContract: DouyinBootstrapFeatureContract;
};

export function bootstrapFeatures(
  features: DouyinRuntimeConfig["features"],
  _contract: DouyinBootstrapFeatureContract,
): DouyinRuntimeConfig["features"] {
  return { ...features, douyin_phone: false, phone_capture_mode: "sms" };
}
