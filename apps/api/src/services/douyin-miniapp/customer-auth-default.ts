import { DouyinOpenPlatformClient } from "@/gateways/douyin-open-platform/client";
import { douyinMiniappContentRepository } from "@/repositories/douyin-miniapp-content";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import { phoneIdentityCandidateRepository } from "@/repositories/phone-identity-candidates";
import { phoneIdentityLoginRepository } from "@/repositories/phone-identity-login";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";
import { authUsersService } from "@/services/auth-users";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { userIdentityService } from "@/services/user-identities";
import { wechatCustomerIdentityService } from "@/services/wechat-customer-identities/legacy-service";
import { DouyinMiniappAccessTokenService } from "./access-tokens";
import { loadDouyinMiniappConfig } from "./config";
import { DouyinCustomerAuthService } from "./customer-auth";

function createDefaultPhoneDependencies() {
  const config = loadDouyinMiniappConfig();
  const openPlatform = new DouyinOpenPlatformClient();
  return {
    accessTokens: new DouyinMiniappAccessTokenService({
      componentAppId: config.componentAppId,
      componentAppSecret: config.componentAppSecret,
      credentialKeyring: config.credentialKeyring,
      componentRepository: new DouyinThirdPartyComponentsRepository(),
      installationRepository: new DouyinMiniappInstallationsRepository(),
      openPlatform,
    }),
    phoneGateway: openPlatform,
  };
}

const phoneDependencies = createDefaultPhoneDependencies();

export const douyinCustomerAuthService = new DouyinCustomerAuthService({
  smsService: smsVerificationCodeService,
  sessionRepository: phoneIdentityLoginRepository,
  candidateRepository: phoneIdentityCandidateRepository,
  authUsers: authUsersService,
  userIdentities: userIdentityService,
  customerIdentity: wechatCustomerIdentityService,
  contextRepository: douyinMiniappContentRepository,
  accessTokens: phoneDependencies.accessTokens,
  phoneGateway: phoneDependencies.phoneGateway,
});
