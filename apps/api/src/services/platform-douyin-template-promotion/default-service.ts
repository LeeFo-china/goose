import { DouyinOpenPlatformClient } from
  "@/gateways/douyin-open-platform/client";
import { createDouyinTemplateManagementClient } from
  "@/gateways/douyin-open-platform/template-client";
import { DouyinMiniappInstallationsRepository } from
  "@/repositories/douyin-miniapp-installations";
import { DouyinDeployableTemplatesRepository } from
  "@/repositories/douyin-deployable-templates";
import { DouyinThirdPartyComponentsRepository } from
  "@/repositories/douyin-third-party-components";
import { accessPolicyService } from "@/services/access-policy";
import { DouyinMiniappAccessTokenService } from
  "@/services/douyin-miniapp/access-tokens";
import { loadDouyinMiniappConfig } from "@/services/douyin-miniapp/config";
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
    templates: new DouyinDeployableTemplatesRepository(),
  };
}
