import { DouyinOpenPlatformClient } from "@/gateways/douyin-open-platform/client";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import { douyinMiniappReleasesRepository } from "@/repositories/douyin-miniapp-releases";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";
import { accessPolicyService } from "@/services/access-policy";
import { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import { loadDouyinMiniappConfig } from "@/services/douyin-miniapp/config";
import { resolveDouyinDeploymentEnvironment } from "@/services/douyin-miniapp/deployment-environment";
import type { PlatformDouyinMiniappReleasesDependencies } from "../platform-douyin-miniapp-releases";

export function createDefaultReleaseDependencies(): PlatformDouyinMiniappReleasesDependencies {
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
    installationRepository,
    releaseRepository: douyinMiniappReleasesRepository,
    accessPolicy: accessPolicyService,
    accessTokens,
    gateway: openPlatform,
    deploymentEnvironment: () => resolveDouyinDeploymentEnvironment(
      process.env.GOOES_DEPLOY_ENV,
    ),
  };
}
