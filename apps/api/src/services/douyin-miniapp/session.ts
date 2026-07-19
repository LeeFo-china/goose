import { createHmac } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinOpenPlatformClient,
  type Code2SessionResult,
  type DouyinOpenPlatformGateway,
} from "@/gateways/douyin-open-platform/client";
import {
  DouyinMiniappSessionsRepository,
  type DouyinMiniappSessionRecord,
} from "@/repositories/douyin-miniapp-sessions";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";
import type { DouyinMiniappSessionRequest } from "@/schema/douyin-miniapp";
import {
  getDouyinMiniappTokenExpiresInSeconds,
  signDouyinMiniappToken,
  type DouyinMiniappTokenInput,
} from "@/utils/jwt";
import { DouyinMiniappAccessTokenService } from "./access-tokens";
import { loadDouyinMiniappConfig } from "./config";

type SessionInstallationRepository = Pick<DouyinMiniappSessionsRepository, "findByAppId">;
type AccessTokens = Pick<
  DouyinMiniappAccessTokenService,
  "getAuthorizerAccessToken" | "forceRefreshAuthorizerAccessToken"
>;
type SessionGateway = Pick<
  DouyinOpenPlatformGateway,
  "code2Session" | "code2SessionForTemplate"
>;
type SessionOptions = {
  readonly installationRepository: SessionInstallationRepository;
  readonly accessTokens: AccessTokens;
  readonly openPlatform: SessionGateway;
  readonly templateAppId: string;
  readonly templateAppSecretProvider: () => string;
  readonly subjectHashKey: string;
  readonly tokenSigner?: (payload: DouyinMiniappTokenInput) => string;
  readonly expiresInSeconds?: () => number;
};

export type DouyinMiniappSessionInstallation = DouyinMiniappSessionRecord;

export class DouyinMiniappSessionService {
  private readonly tokenSigner: (payload: DouyinMiniappTokenInput) => string;
  private readonly expiresInSeconds: () => number;

  constructor(private readonly options: SessionOptions) {
    this.tokenSigner = options.tokenSigner ?? signDouyinMiniappToken;
    this.expiresInSeconds = options.expiresInSeconds
      ?? getDouyinMiniappTokenExpiresInSeconds;
  }

  async exchange(input: DouyinMiniappSessionRequest) {
    try {
      const installation = await this.options.installationRepository.findByAppId(
        input.app_id,
      );
      this.assertInstallationAvailable(installation);
      const identity = installation.installation_kind === "merchant"
        ? await this.exchangeMerchant(installation, input)
        : await this.exchangeTemplate(installation, input);
      const subjectHash = this.createSubjectHash(
        installation.authorizer_appid,
        requiredDouyinIdentity(identity),
      );
      const accessToken = this.tokenSigner({
        tenant_id: installation.tenant_id,
        douyin_installation_id: installation.id,
        douyin_app_id: installation.authorizer_appid,
        subject_hash: subjectHash,
      });
      return {
        access_token: accessToken,
        expires_in: this.expiresInSeconds(),
        installation: {
          status: "active" as const,
          template_version: installation.template_version,
        },
      };
    } catch (error) {
      if (error instanceof AppError && SAFE_SESSION_ERROR_CODES.has(error.code)) {
        throw error;
      }
      throw Errors.business(
        502,
        "抖音小程序登录会话交换失败",
        "DOUYIN_SESSION_EXCHANGE_FAILED",
      );
    }
  }

  private assertInstallationAvailable(
    installation: DouyinMiniappSessionRecord | null,
  ): asserts installation is DouyinMiniappSessionRecord & {
    tenant_id: string;
    tenant: NonNullable<DouyinMiniappSessionRecord["tenant"]>;
  } {
    if (!installation || installation.authorization_status === "authorized_unbound") {
      throw installationMissingError();
    }
    if (installation.authorization_status === "revoked") {
      throw Errors.business(
        409,
        "抖音小程序授权已失效",
        "DOUYIN_AUTHORIZATION_EXPIRED",
      );
    }
    if (installation.authorization_status === "disabled") {
      throw Errors.business(
        409,
        "抖音小程序服务已暂停",
        "DOUYIN_INSTALLATION_DISABLED",
      );
    }
    if (
      !installation.tenant_id
      || !installation.tenant
      || installation.tenant.id !== installation.tenant_id
      || installation.tenant.status !== "active"
    ) {
      throw Errors.business(409, "装修公司不可用", "TENANT_NOT_AVAILABLE");
    }
  }

  private async exchangeMerchant(
    installation: DouyinMiniappSessionRecord,
    input: DouyinMiniappSessionRequest,
  ) {
    if (!input.deployment_key || input.deployment_key !== installation.deployment_key) {
      throw installationMissingError();
    }
    const authorizerAccessToken = await this.options.accessTokens.getAuthorizerAccessToken({
      authorizerAppId: installation.authorizer_appid,
      deploymentKey: input.deployment_key,
    });
    try {
      return await this.exchangeMerchantCode(installation, input, authorizerAccessToken);
    } catch (error) {
      if (
        !(error instanceof AppError)
        || error.code !== "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_EXPIRED"
      ) {
        throw error;
      }
      const refreshedAccessToken = await this.options.accessTokens
        .forceRefreshAuthorizerAccessToken({
          authorizerAppId: installation.authorizer_appid,
          deploymentKey: input.deployment_key,
          rejectedAccessToken: authorizerAccessToken,
        });
      return this.exchangeMerchantCode(installation, input, refreshedAccessToken);
    }
  }

  private exchangeMerchantCode(
    installation: DouyinMiniappSessionRecord,
    input: DouyinMiniappSessionRequest,
    authorizerAccessToken: string,
  ) {
    return this.options.openPlatform.code2Session({
      authorizerAccessToken,
      appId: installation.authorizer_appid,
      code: input.code,
    });
  }

  private async exchangeTemplate(
    installation: DouyinMiniappSessionRecord,
    input: DouyinMiniappSessionRequest,
  ) {
    if (
      installation.authorizer_appid !== this.options.templateAppId
      || input.app_id !== this.options.templateAppId
      || input.deployment_key !== undefined
    ) {
      throw installationMissingError();
    }
    return this.options.openPlatform.code2SessionForTemplate({
      appId: installation.authorizer_appid,
      appSecret: this.options.templateAppSecretProvider(),
      code: input.code,
    });
  }

  private createSubjectHash(appId: string, douyinIdentity: string): string {
    return createHmac("sha256", this.options.subjectHashKey)
      .update(`${appId}:${douyinIdentity}`)
      .digest("hex");
  }
}

const SAFE_SESSION_ERROR_CODES = new Set([
  "DOUYIN_INSTALLATION_MISSING",
  "DOUYIN_INSTALLATION_DISABLED",
  "DOUYIN_AUTHORIZATION_EXPIRED",
  "TENANT_NOT_AVAILABLE",
]);

function requiredDouyinIdentity(identity: Code2SessionResult): string {
  const value = identity.openId?.trim() || identity.anonymousOpenId?.trim();
  if (value) return value;
  throw Errors.business(
    502,
    "抖音小程序登录身份无效",
    "DOUYIN_SESSION_EXCHANGE_FAILED",
  );
}

function installationMissingError() {
  return Errors.business(
    409,
    "抖音小程序安装配置不存在",
    "DOUYIN_INSTALLATION_MISSING",
  );
}

let defaultService: DouyinMiniappSessionService | undefined;

export function getDouyinMiniappSessionService(): DouyinMiniappSessionService {
  if (defaultService) return defaultService;
  const config = loadDouyinMiniappConfig();
  const componentRepository = new DouyinThirdPartyComponentsRepository();
  const installationRepository = new DouyinMiniappInstallationsRepository();
  const openPlatform = new DouyinOpenPlatformClient();
  const accessTokens = new DouyinMiniappAccessTokenService({
    componentAppId: config.componentAppId,
    componentAppSecret: config.componentAppSecret,
    credentialKeyring: config.credentialKeyring,
    componentRepository,
    installationRepository,
    openPlatform,
  });
  defaultService = new DouyinMiniappSessionService({
    installationRepository: new DouyinMiniappSessionsRepository(),
    accessTokens,
    openPlatform,
    templateAppId: config.templateAppId,
    templateAppSecretProvider: () => config.templateAppSecret,
    subjectHashKey: config.subjectHashKey,
  });
  return defaultService;
}
