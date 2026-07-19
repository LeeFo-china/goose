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
const MIN_LEASE_REMAINING_MS = 10_000;
const COMPONENT_REFRESH_ERROR = "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED";
const AUTHORIZER_REFRESH_ERROR = "DOUYIN_AUTHORIZER_TOKEN_REFRESH_FAILED";
const AUTHORIZATION_EXPIRED_ERROR = "DOUYIN_AUTHORIZATION_EXPIRED";
type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
type SetTimer = (callback: () => void, milliseconds: number) => TimerHandle;
type ClearTimer = (handle: TimerHandle) => void;

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
  readonly setTimeout?: SetTimer;
  readonly clearTimeout?: ClearTimer;
};

export class DouyinMiniappAccessTokenService {
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly setTimeout: SetTimer;
  private readonly clearTimeout: ClearTimer;

  constructor(private readonly options: ServiceOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleepWithTimer;
    this.setTimeout = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeout = options.clearTimeout ?? globalThis.clearTimeout;
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
    assertComponentBinding(installation.component_appid, this.options.componentAppId);
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
    if (!hasMinimumLeaseWindow(lease.claimExpiresAt, this.now())) {
      await this.bestEffortFailComponentLease(
        lease.claimToken,
        "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT",
      );
      throw leaseInsufficientError();
    }
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
      await this.bestEffortFailComponentLease(lease.claimToken, COMPONENT_REFRESH_ERROR);
      throw preserveAppError(error, componentRefreshError());
    }
  }

  private async refreshAuthorizerAccessToken(
    installation: DouyinMiniappInstallationRecord,
    lease: DouyinRefreshLease,
  ): Promise<string> {
    await this.assertAuthorizerLeaseWindow(installation.id, lease);
    await this.assertRefreshTokenValid(installation, lease.claimToken);
    try {
      const componentAccessToken = await this.getComponentAccessToken();
      await this.assertRefreshTokenValid(installation, lease.claimToken);
      const refreshToken = openDouyinCredential(
        requiredRefreshToken(installation),
        this.options.credentialKeyring,
      );
      await this.assertAuthorizerLeaseWindow(installation.id, lease);
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
      if (isTerminalAuthorizerRefreshError(error)) throw error;
      const isAuthorizationExpired = error instanceof AppError &&
        error.code === AUTHORIZATION_EXPIRED_ERROR;
      const failureCode = isAuthorizationExpired
        ? AUTHORIZATION_EXPIRED_ERROR
        : AUTHORIZER_REFRESH_ERROR;
      await this.bestEffortFailAuthorizerLease(
        installation.id,
        lease.claimToken,
        failureCode,
      );
      if (isAuthorizationExpired) throw authorizationExpiredError();
      throw preserveAppError(error, authorizerRefreshError());
    }
  }

  private async pollComponentAccessToken(): Promise<string> {
    const deadline = this.now() + REFRESH_POLL_LIMIT_MS;
    while (true) {
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      await this.sleep(Math.min(REFRESH_POLL_INTERVAL_MS, remaining));
      if (this.now() >= deadline) break;
      const row = await this.readWithinDeadline(
        () => this.options.componentRepository.findActive(this.options.componentAppId),
        deadline,
      );
      if (this.now() >= deadline) break;
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
    const deadline = this.now() + REFRESH_POLL_LIMIT_MS;
    while (true) {
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      await this.sleep(Math.min(REFRESH_POLL_INTERVAL_MS, remaining));
      if (this.now() >= deadline) break;
      const row = await this.readWithinDeadline(
        () => this.options.installationRepository.findActiveMerchant(
          input.authorizerAppId,
          input.deploymentKey,
        ),
        deadline,
      );
      if (this.now() >= deadline) break;
      if (!row) break;
      assertComponentBinding(row.component_appid, this.options.componentAppId);
      const stored = this.openValidAccessToken(row);
      if (stored) return stored;
    }
    throw pollTimeoutError();
  }

  private readWithinDeadline<Result>(
    read: () => Promise<Result>,
    deadline: number,
  ): Promise<Result> {
    const remaining = deadline - this.now();
    if (remaining <= 0) return Promise.reject(pollTimeoutError());
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: TimerHandle | undefined;
      const settle = (complete: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) this.clearTimeout(timer);
        complete();
      };
      timer = this.setTimeout(
        () => settle(() => reject(pollTimeoutError())),
        remaining,
      );
      if (settled) this.clearTimeout(timer);
      Promise.resolve().then(read).then(
        (result) => settle(() => resolve(result)),
        (error: unknown) => settle(() => reject(error)),
      );
    });
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

  private async assertAuthorizerLeaseWindow(
    installationId: string,
    lease: DouyinRefreshLease,
  ): Promise<void> {
    if (hasMinimumLeaseWindow(lease.claimExpiresAt, this.now())) return;
    await this.bestEffortFailAuthorizerLease(
      installationId,
      lease.claimToken,
      "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT",
    );
    throw leaseInsufficientError();
  }

  private async assertRefreshTokenValid(
    installation: DouyinMiniappInstallationRecord,
    claimToken: string,
  ): Promise<void> {
    if (isStrictlyFuture(installation.refresh_token_expires_at, this.now())) return;
    await this.bestEffortFailAuthorizerLease(
      installation.id,
      claimToken,
      AUTHORIZATION_EXPIRED_ERROR,
    );
    throw authorizationExpiredError();
  }

  private async bestEffortFailComponentLease(
    claimToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.options.componentRepository.failAccessTokenRefresh({
        componentAppId: this.options.componentAppId,
        claimToken,
        errorCode,
      });
    } catch { return; }
  }

  private async bestEffortFailAuthorizerLease(
    installationId: string,
    claimToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.options.installationRepository.failAccessTokenRefresh({
        installationId,
        claimToken,
        errorCode,
      });
    } catch { return; }
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

function isStrictlyFuture(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}

function hasMinimumLeaseWindow(claimExpiresAt: string, now: number): boolean {
  const expiresAtMs = Date.parse(claimExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + MIN_LEASE_REMAINING_MS;
}

function assertComponentBinding(actual: string, expected: string): void {
  if (actual !== expected) {
    throw Errors.business(
      409,
      "抖音小程序授权组件不匹配",
      "DOUYIN_COMPONENT_APP_ID_MISMATCH",
    );
  }
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

function isTerminalAuthorizerRefreshError(error: unknown): boolean {
  return error instanceof AppError && [
    "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH",
    "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT",
  ].includes(error.code);
}

function preserveAppError(error: unknown, fallback: AppError): AppError {
  return error instanceof AppError ? error : fallback;
}

function leaseMismatchError(): AppError {
  return Errors.business(409, "抖音凭证刷新租约已失效", "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH");
}

function leaseInsufficientError(): AppError {
  return Errors.business(
    503,
    "抖音凭证刷新租约剩余时间不足",
    "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT",
  );
}

function componentRefreshError(): AppError {
  return Errors.business(502, "抖音组件凭证刷新失败", COMPONENT_REFRESH_ERROR);
}

function authorizerRefreshError(): AppError {
  return Errors.business(502, "抖音授权凭证刷新失败", AUTHORIZER_REFRESH_ERROR);
}

function authorizationExpiredError(): AppError {
  return Errors.business(401, "抖音小程序需要重新授权", AUTHORIZATION_EXPIRED_ERROR);
}

function pollTimeoutError(): AppError {
  return Errors.business(503, "等待抖音凭证刷新超时", "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT");
}

function sleepWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
