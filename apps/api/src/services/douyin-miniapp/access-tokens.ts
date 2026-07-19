import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type {
  AuthorizerTokenResult,
  DouyinOpenPlatformGateway,
} from "@/gateways/douyin-open-platform/client";
import type {
  DouyinRefreshLease,
  DouyinThirdPartyComponentRecord,
  DouyinTokenEnvelopeInput,
} from "@/repositories/douyin-third-party-components";
import type {
  AuthorizerRefreshRotation,
  DouyinMiniappInstallationRecord,
} from "@/repositories/douyin-miniapp-installations";
import {
  openDouyinCredential,
  sealDouyinCredential,
  type DouyinCredentialEnvelope,
  type DouyinCredentialKeyring,
} from "./credential-envelope";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_POLL_LIMIT_MS = 3_000;
const REFRESH_POLL_INTERVAL_MS = 100;
const COMPONENT_REFRESH_ERROR = "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED";
const AUTHORIZATION_EXPIRED_ERROR = "DOUYIN_AUTHORIZATION_EXPIRED";

export interface ComponentTokenRepository {
  findActive(componentAppId: string): Promise<DouyinThirdPartyComponentRecord | null>;
  claimAccessTokenRefresh(componentAppId: string): Promise<DouyinRefreshLease | null>;
  completeAccessTokenRefresh(input: {
    readonly componentAppId: string;
    readonly claimToken: string;
    readonly accessToken: DouyinTokenEnvelopeInput;
  }): Promise<boolean>;
  failAccessTokenRefresh(input: {
    readonly componentAppId: string;
    readonly claimToken: string;
    readonly errorCode: string;
  }): Promise<boolean>;
}

export interface AuthorizerTokenRepository {
  findActiveMerchant(
    authorizerAppId: string,
    deploymentKey: string,
  ): Promise<DouyinMiniappInstallationRecord | null>;
  claimAccessTokenRefresh(installationId: string): Promise<DouyinRefreshLease | null>;
  completeAccessTokenRefresh(input: {
    readonly installationId: string;
    readonly claimToken: string;
    readonly accessToken: DouyinTokenEnvelopeInput;
    readonly refreshToken: AuthorizerRefreshRotation;
  }): Promise<boolean>;
  failAccessTokenRefresh(input: {
    readonly installationId: string;
    readonly claimToken: string;
    readonly errorCode: string;
  }): Promise<boolean>;
}

type ServiceOptions = {
  readonly componentAppId: string;
  readonly componentAppSecret: string;
  readonly credentialKeyring: DouyinCredentialKeyring;
  readonly componentRepository: ComponentTokenRepository;
  readonly installationRepository: AuthorizerTokenRepository;
  readonly openPlatform: DouyinOpenPlatformGateway;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

export class DouyinMiniappAccessTokenService {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: ServiceOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleepWithTimer;
  }

  async getComponentAccessToken(): Promise<string> {
    const row = await this.options.componentRepository.findActive(
      this.options.componentAppId,
    );
    if (!row) {
      throw Errors.business(503, "抖音第三方组件未启用", "DOUYIN_COMPONENT_NOT_ACTIVE");
    }
    const stored = this.openValidAccessToken(row);
    if (stored) return stored;

    const lease = await this.options.componentRepository.claimAccessTokenRefresh(
      this.options.componentAppId,
    );
    if (!lease) return this.pollComponentAccessToken();
    return this.refreshComponentAccessToken(row, lease);
  }

  async getAuthorizerAccessToken(input: {
    readonly authorizerAppId: string;
    readonly deploymentKey: string;
  }): Promise<string> {
    const installation = await this.options.installationRepository.findActiveMerchant(
      input.authorizerAppId,
      input.deploymentKey,
    );
    if (!installation) {
      throw Errors.business(404, "抖音小程序授权不存在", "DOUYIN_INSTALLATION_NOT_ACTIVE");
    }
    const stored = this.openValidAccessToken(installation);
    if (stored) return stored;

    const lease = await this.options.installationRepository.claimAccessTokenRefresh(
      installation.id,
    );
    if (!lease) return this.pollAuthorizerAccessToken(input);
    return this.refreshAuthorizerAccessToken(installation, lease);
  }

  private async refreshComponentAccessToken(
    row: DouyinThirdPartyComponentRecord,
    lease: DouyinRefreshLease,
  ): Promise<string> {
    try {
      const ticket = openDouyinCredential(requiredComponentTicket(row), this.options.credentialKeyring);
      const refreshed = await this.options.openPlatform.getComponentAccessToken({
        componentAppId: this.options.componentAppId,
        componentAppSecret: this.options.componentAppSecret,
        componentTicket: ticket,
      });
      const accessToken = this.sealToken(refreshed.accessToken, refreshed.expiresIn);
      const completed = await this.options.componentRepository.completeAccessTokenRefresh({
        componentAppId: this.options.componentAppId,
        claimToken: lease.claimToken,
        accessToken,
      });
      if (!completed) throw leaseMismatchError();
      return refreshed.accessToken;
    } catch (error) {
      if (isLeaseMismatch(error)) throw error;
      await this.failComponentLease(lease.claimToken);
      throw Errors.business(502, "抖音组件凭证刷新失败", COMPONENT_REFRESH_ERROR);
    }
  }

  private async refreshAuthorizerAccessToken(
    installation: DouyinMiniappInstallationRecord,
    lease: DouyinRefreshLease,
  ): Promise<string> {
    try {
      const componentAccessToken = await this.getComponentAccessToken();
      const refreshToken = openDouyinCredential(
        requiredRefreshToken(installation),
        this.options.credentialKeyring,
      );
      const refreshed = await this.options.openPlatform.refreshAuthorizerToken({
        componentAccessToken,
        authorizerRefreshToken: refreshToken,
      });
      assertAuthorizerAppId(refreshed, installation.authorizer_appid);
      const completed = await this.options.installationRepository.completeAccessTokenRefresh({
        installationId: installation.id,
        claimToken: lease.claimToken,
        accessToken: this.sealToken(refreshed.accessToken, refreshed.expiresIn),
        refreshToken: this.sealRefreshToken(refreshed),
      });
      if (!completed) throw leaseMismatchError();
      return refreshed.accessToken;
    } catch (error) {
      if (isLeaseMismatch(error)) throw error;
      await this.failAuthorizerLease(installation.id, lease.claimToken);
      throw Errors.business(401, "抖音小程序需要重新授权", AUTHORIZATION_EXPIRED_ERROR);
    }
  }

  private async pollComponentAccessToken(): Promise<string> {
    const startedAt = this.now();
    while (this.now() - startedAt < REFRESH_POLL_LIMIT_MS) {
      await this.sleep(REFRESH_POLL_INTERVAL_MS);
      const row = await this.options.componentRepository.findActive(
        this.options.componentAppId,
      );
      if (!row) break;
      const stored = this.openValidAccessToken(row);
      if (stored) return stored;
    }
    throw pollTimeoutError();
  }

  private async pollAuthorizerAccessToken(input: {
    readonly authorizerAppId: string;
    readonly deploymentKey: string;
  }): Promise<string> {
    const startedAt = this.now();
    while (this.now() - startedAt < REFRESH_POLL_LIMIT_MS) {
      await this.sleep(REFRESH_POLL_INTERVAL_MS);
      const row = await this.options.installationRepository.findActiveMerchant(
        input.authorizerAppId,
        input.deploymentKey,
      );
      if (!row) break;
      const stored = this.openValidAccessToken(row);
      if (stored) return stored;
    }
    throw pollTimeoutError();
  }

  private openValidAccessToken(row: {
    readonly access_token_ciphertext: string | null;
    readonly access_token_iv: string | null;
    readonly access_token_tag: string | null;
    readonly access_token_key_version: string | null;
    readonly access_token_expires_at: string | null;
  }): string | null {
    if (!isValidBeyondBuffer(row.access_token_expires_at, this.now())) return null;
    const envelope = requiredEnvelope({
      ciphertext: row.access_token_ciphertext,
      iv: row.access_token_iv,
      tag: row.access_token_tag,
      keyVersion: row.access_token_key_version,
    });
    return openDouyinCredential(envelope, this.options.credentialKeyring);
  }

  private sealToken(plaintext: string, expiresIn: number): DouyinTokenEnvelopeInput {
    const sealed = sealDouyinCredential(plaintext, this.options.credentialKeyring);
    return {
      ...sealed,
      expiresAt: new Date(this.now() + expiresIn * 1000).toISOString(),
    };
  }

  private sealRefreshToken(result: AuthorizerTokenResult): AuthorizerRefreshRotation {
    const sealed = sealDouyinCredential(result.refreshToken, this.options.credentialKeyring);
    return {
      ...sealed,
      expiresAt: new Date(this.now() + result.refreshExpiresIn * 1000).toISOString(),
    };
  }

  private async failComponentLease(claimToken: string): Promise<void> {
    try {
      const failed = await this.options.componentRepository.failAccessTokenRefresh({
        componentAppId: this.options.componentAppId,
        claimToken,
        errorCode: COMPONENT_REFRESH_ERROR,
      });
      if (!failed) throw leaseFailureError();
    } catch {
      throw leaseFailureError();
    }
  }

  private async failAuthorizerLease(installationId: string, claimToken: string): Promise<void> {
    try {
      const failed = await this.options.installationRepository.failAccessTokenRefresh({
        installationId,
        claimToken,
        errorCode: AUTHORIZATION_EXPIRED_ERROR,
      });
      if (!failed) throw leaseFailureError();
    } catch {
      throw leaseFailureError();
    }
  }
}

function requiredComponentTicket(row: DouyinThirdPartyComponentRecord): DouyinCredentialEnvelope {
  return requiredEnvelope({
    ciphertext: row.component_ticket_ciphertext,
    iv: row.component_ticket_iv,
    tag: row.component_ticket_tag,
    keyVersion: row.component_ticket_key_version,
  });
}

function requiredRefreshToken(row: DouyinMiniappInstallationRecord): DouyinCredentialEnvelope {
  return requiredEnvelope({
    ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv,
    tag: row.refresh_token_tag,
    keyVersion: row.refresh_token_key_version,
  });
}

function requiredEnvelope(input: {
  readonly ciphertext: string | null;
  readonly iv: string | null;
  readonly tag: string | null;
  readonly keyVersion: string | null;
}): DouyinCredentialEnvelope {
  if (!input.ciphertext || !input.iv || !input.tag || !input.keyVersion) {
    throw Errors.business(500, "抖音凭证存储状态无效", "DOUYIN_CREDENTIAL_STATE_INVALID");
  }
  return {
    ciphertext: input.ciphertext,
    iv: input.iv,
    tag: input.tag,
    keyVersion: input.keyVersion,
  };
}

function isValidBeyondBuffer(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + TOKEN_EXPIRY_BUFFER_MS;
}

function assertAuthorizerAppId(result: AuthorizerTokenResult, expected: string): void {
  if (result.authorizerAppId !== expected) {
    throw Errors.business(
      502,
      "抖音授权小程序标识不匹配",
      "DOUYIN_AUTHORIZER_APP_ID_MISMATCH",
    );
  }
}

function isLeaseMismatch(error: unknown): boolean {
  return error instanceof AppError && error.code === "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH";
}

function leaseMismatchError(): AppError {
  return Errors.business(409, "抖音凭证刷新租约已失效", "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH");
}

function leaseFailureError(): AppError {
  return Errors.business(503, "抖音凭证刷新租约处理失败", "DOUYIN_TOKEN_REFRESH_LEASE_FAILURE");
}

function pollTimeoutError(): AppError {
  return Errors.business(503, "等待抖音凭证刷新超时", "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT");
}

function sleepWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
