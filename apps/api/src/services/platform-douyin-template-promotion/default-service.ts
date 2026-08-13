import { DouyinOpenPlatformClient } from
  "@/gateways/douyin-open-platform/client";
import { createDouyinTemplateManagementClient } from
  "@/gateways/douyin-open-platform/template-client";
import { DouyinMiniappInstallationsRepository } from
  "@/repositories/douyin-miniapp-installations";
import { DouyinThirdPartyComponentsRepository } from
  "@/repositories/douyin-third-party-components";
import { accessPolicyService } from "@/services/access-policy";
import { DouyinMiniappAccessTokenService } from
  "@/services/douyin-miniapp/access-tokens";
import { loadDouyinMiniappConfig } from "@/services/douyin-miniapp/config";
import { getPlatformDouyinMiniappReleasesService } from
  "../platform-douyin-miniapp-releases";
import type { PlatformDouyinTemplatePromotionDependencies } from
  "../platform-douyin-template-promotion";

export function createDefaultTemplatePromotionDependencies():
  PlatformDouyinTemplatePromotionDependencies {
  const config = loadDouyinMiniappConfig();
  const installationRepository = new DouyinMiniappInstallationsRepository();
  const openPlatform = new DouyinOpenPlatformClient();
  const accessTokens = new DouyinMiniappAccessTokenService({
    componentAppId: config.componentAppId,
    componentAppSecret: config.componentAppSecret,
    credentialKeyring: config.credentialKeyring,
    componentRepository: new DouyinThirdPartyComponentsRepository(),
    installationRepository,
    openPlatform,
  });
  return {
    accessPolicy: accessPolicyService,
    accessTokens,
    gateway: createDouyinTemplateManagementClient(),
    templateAppId: config.templateAppId,
    releases: {
      upload: async (...args) =>
        (await getPlatformDouyinMiniappReleasesService()).upload(...args),
      getTestQr: async (...args) =>
        (await getPlatformDouyinMiniappReleasesService()).getTestQr(...args),
    },
  };
}
