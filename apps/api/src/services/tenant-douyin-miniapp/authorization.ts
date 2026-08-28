import { createHash, randomBytes } from "node:crypto";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinOpenPlatformClient,
  type DouyinOpenPlatformGateway,
} from "@/gateways/douyin-open-platform/client";
import {
  douyinMiniappAuthorizationIntentsRepository,
  type AuthorizationIntentClaim,
  type AuthorizationIntentRepositoryPort,
} from "@/repositories/douyin-miniapp-authorization-intents";
import {
  DouyinMiniappInstallationsRepository,
  type DouyinMiniappInstallationRecord,
} from "@/repositories/douyin-miniapp-installations";
import {
  tenantDouyinMiniappWorkspaceRepository,
  type TenantDouyinMiniappWorkspaceInstallation,
} from "@/repositories/tenant-douyin-miniapp-workspace";
import {
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfig,
} from "@/schema/platform-douyin-miniapps";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { DouyinMiniappAccessTokenService } from "@/services/douyin-miniapp/access-tokens";
import { loadDouyinMiniappConfig } from "@/services/douyin-miniapp/config";
import {
  sealDouyinCredential,
  type DouyinCredentialKeyring,
} from "@/services/douyin-miniapp/credential-envelope";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";

const MANAGE_PERMISSION = "douyin_miniapp.manage";
const INTENT_TTL_MS = 10 * 60 * 1000;
const EVENT_CORRELATION_ATTEMPTS = 30;
const EVENT_CORRELATION_INTERVAL_MS = 100;

type WorkspacePort = {
  findCurrentInstallation(
    tenantId: string,
  ): Promise<TenantDouyinMiniappWorkspaceInstallation | null>;
  findPreviousInstallation(
    tenantId: string,
    authorizerAppId: string,
  ): Promise<TenantDouyinMiniappWorkspaceInstallation | null>;
};

type InstallationPort = {
  findActiveByAuthorizerAppId(
    authorizerAppId: string,
  ): Promise<DouyinMiniappInstallationRecord | null>;
};

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "assertPermission"
>;

type ComponentAccessTokenPort = {
  getComponentAccessToken(): Promise<string>;
};

type AuthorizationGatewayPort = Pick<
  DouyinOpenPlatformGateway,
  "generateAuthorizationLink" | "exchangeAuthorizationCode"
>;

type AuthorizationDependencies = {
  readonly intents: AuthorizationIntentRepositoryPort;
  readonly workspace: WorkspacePort;
  readonly installations: InstallationPort;
  readonly accessPolicy: AccessPolicyPort;
  readonly accessTokens: ComponentAccessTokenPort;
  readonly gateway: AuthorizationGatewayPort;
  readonly componentAppId: string;
  readonly credentialKeyring: DouyinCredentialKeyring;
  readonly redirectUri: string;
  readonly runtimeConfig: DouyinRuntimeConfig;
  readonly now?: () => number;
  readonly opaqueIntent?: () => string;
  readonly deploymentKey?: () => string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

type AuthorizationCallbackInput = {
  readonly intent: string;
  readonly authorization_code: string;
  readonly expires_in: number;
};

export class TenantDouyinMiniappAuthorizationService {
  private readonly now: () => number;
  private readonly opaqueIntent: () => string;
  private readonly deploymentKey: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly dependencies: AuthorizationDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.opaqueIntent = dependencies.opaqueIntent
      ?? (() => randomBytes(32).toString("base64url"));
    this.deploymentKey = dependencies.deploymentKey
      ?? (() => `tenant-${randomBytes(24).toString("base64url")}`);
    this.sleep = dependencies.sleep ?? sleepWithTimer;
  }

  async startAuthorization(authContext: AuthContext) {
    const tenantId = this.requireManagePermission(authContext);
    const employeeId = requireEmployeeId(authContext);
    const current = await this.dependencies.workspace.findCurrentInstallation(
      tenantId,
    );
    if (
      current?.installation_kind === "merchant"
      && current.authorization_status === "active"
    ) {
      throw Errors.business(
        409,
        "当前租户已绑定抖音小程序",
        "DOUYIN_TENANT_ALREADY_AUTHORIZED",
      );
    }

    const opaqueIntent = this.opaqueIntent();
    const expiresAt = new Date(this.now() + INTENT_TTL_MS).toISOString();
    const intent = await this.dependencies.intents.create({
      tenantId,
      requestedByEmployeeId: employeeId,
      componentAppId: this.dependencies.componentAppId,
      intentDigest: digest(opaqueIntent),
      expiresAt,
    });

    try {
      const componentAccessToken =
        await this.dependencies.accessTokens.getComponentAccessToken();
      const redirectUri = appendIntent(
        this.dependencies.redirectUri,
        opaqueIntent,
      );
      const result = await this.dependencies.gateway.generateAuthorizationLink({
        componentAccessToken,
        redirectUri,
      });
      return { link: result.link, intent_expires_at: expiresAt };
    } catch (error) {
      await this.failBestEffort(intent.id, "DOUYIN_AUTHORIZATION_LINK_FAILED");
      throw error;
    }
  }

  async completeAuthorizationCallback(
    authContext: AuthContext,
    input: AuthorizationCallbackInput,
  ) {
    const tenantId = this.requireManagePermission(authContext);
    const codeDigest = digest(input.authorization_code);
    const claim = await this.dependencies.intents.claim({
      intentDigest: digest(input.intent),
      authorizationCodeDigest: codeDigest,
    });
    this.assertClaimOwner(claim, tenantId);

    if (claim.state === "completed") {
      return completedResult(requiredAuthorizerAppId(claim));
    }

    try {
      const componentAccessToken =
        await this.dependencies.accessTokens.getComponentAccessToken();
      const tokens = await this.dependencies.gateway.exchangeAuthorizationCode({
        componentAccessToken,
        authorizationCode: input.authorization_code,
      });
      const accessToken = {
        ...sealDouyinCredential(
          tokens.accessToken,
          this.dependencies.credentialKeyring,
        ),
        expiresAt: expiryFromSeconds(this.now(), tokens.expiresIn),
      };
      const refreshToken = {
        ...sealDouyinCredential(
          tokens.refreshToken,
          this.dependencies.credentialKeyring,
        ),
        expiresAt: expiryFromSeconds(this.now(), tokens.refreshExpiresIn),
      };
      await this.completeIntent({
        claim,
        codeDigest,
        authorizerAppId: tokens.authorizerAppId,
        accessToken,
        refreshToken,
        permissions: tokens.permissions,
      });
      return completedResult(tokens.authorizerAppId);
    } catch (error) {
      if (isConsumedAuthorizationCode(error)) {
        return this.completeFromEvent(claim, codeDigest);
      }
      await this.failBestEffort(
        claim.intentId,
        "DOUYIN_AUTHORIZATION_EXCHANGE_FAILED",
      );
      throw error;
    }
  }

  private requireManagePermission(authContext: AuthContext): string {
    const tenantId =
      this.dependencies.accessPolicy.assertTenantContext(authContext);
    this.dependencies.accessPolicy.assertPermission(
      authContext,
      MANAGE_PERMISSION,
    );
    return tenantId;
  }

  private assertClaimOwner(
    claim: AuthorizationIntentClaim,
    tenantId: string,
  ): void {
    if (
      claim.tenantId !== tenantId
      || claim.componentAppId !== this.dependencies.componentAppId
    ) {
      throw Errors.forbidden();
    }
  }

  private async completeFromEvent(
    claim: AuthorizationIntentClaim,
    codeDigest: string,
  ) {
    const authorizerAppId =
      await this.dependencies.intents.findAuthorizerByCodeDigest(codeDigest);
    if (!authorizerAppId) {
      throw authorizationRaceUnresolved();
    }
    const installation = await this.waitForEventInstallation(authorizerAppId);
    assertCorrelatedInstallation(
      installation,
      this.dependencies.componentAppId,
      claim.tenantId,
    );
    await this.completeIntent({
      claim,
      codeDigest,
      authorizerAppId,
      accessToken: null,
      refreshToken: null,
      permissions: null,
    });
    return completedResult(authorizerAppId);
  }

  private async waitForEventInstallation(
    authorizerAppId: string,
  ): Promise<DouyinMiniappInstallationRecord | null> {
    for (let attempt = 0; attempt < EVENT_CORRELATION_ATTEMPTS; attempt += 1) {
      const installation =
        await this.dependencies.installations.findActiveByAuthorizerAppId(
          authorizerAppId,
        );
      if (installation) return installation;
      if (attempt < EVENT_CORRELATION_ATTEMPTS - 1) {
        await this.sleep(EVENT_CORRELATION_INTERVAL_MS);
      }
    }
    return null;
  }

  private async completeIntent(input: {
    readonly claim: AuthorizationIntentClaim;
    readonly codeDigest: string;
    readonly authorizerAppId: string;
    readonly accessToken: Parameters<
      AuthorizationIntentRepositoryPort["complete"]
    >[0]["accessToken"];
    readonly refreshToken: Parameters<
      AuthorizationIntentRepositoryPort["complete"]
    >[0]["refreshToken"];
    readonly permissions: readonly unknown[] | null;
  }): Promise<void> {
    const previousInstallation =
      await this.dependencies.workspace.findPreviousInstallation(
        input.claim.tenantId,
        input.authorizerAppId,
      );
    const runtimeConfig = DouyinRuntimeConfigSchema.parse({
      ...this.dependencies.runtimeConfig,
      ...previousInstallation?.runtime_config,
    });
    await this.dependencies.intents.complete({
      intentId: input.claim.intentId,
      authorizationCodeDigest: input.codeDigest,
      authorizerAppId: input.authorizerAppId,
      deploymentKey: this.deploymentKey(),
      runtimeConfig,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      permissions: input.permissions,
    });
  }

  private async failBestEffort(
    intentId: string,
    failureCode: string,
  ): Promise<void> {
    try {
      await this.dependencies.intents.fail({ intentId, failureCode });
    } catch {
      // The original upstream error remains the actionable failure.
    }
  }
}

function requireEmployeeId(authContext: AuthContext): string {
  if (!authContext.employeeId) throw Errors.forbidden();
  return authContext.employeeId;
}

function appendIntent(redirectUri: string, intent: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("intent", intent);
  return url.toString();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function expiryFromSeconds(now: number, seconds: number): string {
  return new Date(now + seconds * 1000).toISOString();
}

function completedResult(authorizerAppId: string) {
  return { status: "completed" as const, authorizer_appid: authorizerAppId };
}

function requiredAuthorizerAppId(claim: AuthorizationIntentClaim): string {
  if (claim.authorizerAppId) return claim.authorizerAppId;
  throw Errors.business(
    500,
    "已完成的抖音授权缺少应用标识",
    "DOUYIN_AUTHORIZATION_COMPLETION_INVALID",
  );
}

function isConsumedAuthorizationCode(error: unknown): boolean {
  return error instanceof AppError
    && error.code === "DOUYIN_AUTHORIZATION_CODE_INVALID_OR_CONSUMED";
}

function assertCorrelatedInstallation(
  installation: DouyinMiniappInstallationRecord | null,
  componentAppId: string,
  tenantId: string,
): void {
  if (
    !installation
    || installation.component_appid !== componentAppId
    || installation.installation_kind !== "merchant"
    || !["authorized_unbound", "active"].includes(
      installation.authorization_status,
    )
    || (installation.tenant_id !== null && installation.tenant_id !== tenantId)
  ) {
    throw authorizationRaceUnresolved();
  }
}

function authorizationRaceUnresolved(): AppError {
  return Errors.business(
    409,
    "抖音授权事件仍在处理中，请稍后重试",
    "DOUYIN_AUTHORIZATION_EVENT_NOT_READY",
  );
}

function sleepWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const DEFAULT_RUNTIME_CONFIG = DouyinRuntimeConfigSchema.parse({
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: "sms",
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: "2026-07-19",
});

let defaultService: TenantDouyinMiniappAuthorizationService | undefined;

export function getTenantDouyinMiniappAuthorizationService():
TenantDouyinMiniappAuthorizationService {
  if (defaultService) return defaultService;
  const config = loadDouyinMiniappConfig();
  const redirectUri = requireRedirectUri(
    process.env.DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI,
  );
  const componentRepository = new DouyinThirdPartyComponentsRepository();
  const installations = new DouyinMiniappInstallationsRepository();
  const gateway = new DouyinOpenPlatformClient();
  const accessTokens = new DouyinMiniappAccessTokenService({
    componentAppId: config.componentAppId,
    componentAppSecret: config.componentAppSecret,
    credentialKeyring: config.credentialKeyring,
    componentRepository,
    installationRepository: installations,
    openPlatform: gateway,
  });
  defaultService = new TenantDouyinMiniappAuthorizationService({
    intents: douyinMiniappAuthorizationIntentsRepository,
    workspace: tenantDouyinMiniappWorkspaceRepository,
    installations,
    accessPolicy: accessPolicyService,
    accessTokens,
    gateway,
    componentAppId: config.componentAppId,
    credentialKeyring: config.credentialKeyring,
    redirectUri,
    runtimeConfig: DEFAULT_RUNTIME_CONFIG,
  });
  return defaultService;
}

function requireRedirectUri(value: string | undefined): string {
  try {
    if (!value) throw new TypeError("missing redirect URI");
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.hash
    ) {
      throw new TypeError("unsafe redirect URI");
    }
    return url.toString();
  } catch {
    throw Errors.business(
      503,
      "抖音租户授权回调地址配置无效",
      "DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI_INVALID",
    );
  }
}
