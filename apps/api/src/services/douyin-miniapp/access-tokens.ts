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
  type DouyinCredentialKeyring,
} from "./credential-envelope";
import {
  AUTHORIZATION_EXPIRED_ERROR,
  AUTHORIZER_REFRESH_ERROR,
  COMPONENT_REFRESH_ERROR,
  assertAuthorizerAppId,
  assertComponentBinding,
  authorizationExpiredError,
  authorizerPersistenceRecoverableError,
  authorizerRefreshError,
  componentRefreshError,
  hasLeaseHeadroom,
  hasMinimumLeaseWindow,
  isLeaseMismatch,
  isRecoverableRefreshRejection,
  isStrictlyFuture,
  isTerminalAuthorizerRefreshError,
  isValidBeyondBuffer,
  leaseInsufficientError,
  leaseMismatchError,
  matchesPersistedTokens,
  pollTimeoutError,
  persistenceOperationTimeoutError,
  preserveAppError,
  raceOperation,
  requiredComponentTicket,
  requiredDeploymentKey,
  requiredEnvelope,
  requiredRefreshToken,
  settleBestEffortWithin,
  type ClearTimer,
  type SealedAuthorizerTokens,
  type SetTimer,
} from "./access-token-support";
const REFRESH_POLL_LIMIT_MS = 3_000;
const REFRESH_POLL_INTERVAL_MS = 100;
const BEST_EFFORT_FAIL_TIMEOUT_MS = 500;
const PERSISTENCE_OPERATION_TIMEOUT_MS = 1_000;
const RECOVERY_START_HEADROOM_MS = 22_000;
const RECOVERY_EXCHANGE_HEADROOM_MS = 12_000;
type PersistenceOutcome = {
  readonly status: "persisted" | "explicitly_rejected" | "unknown";
};
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
      let refreshed: AuthorizerTokenResult;
      try {
        refreshed = await this.options.openPlatform.refreshAuthorizerToken({
          componentAccessToken,
          authorizerRefreshToken: refreshToken,
        });
      } catch (error) {
        if (isRecoverableRefreshRejection(error)) {
          return await this.compensateAuthorizerAccessToken(
            installation,
            lease,
            componentAccessToken,
          );
        }
        throw error;
      }
      assertAuthorizerAppId(refreshed, installation.authorizer_appid);
      const tokens = {
        accessToken: this.sealToken(refreshed.accessToken, refreshed.expiresIn),
        refreshToken: this.sealRefreshToken(refreshed),
      };
      const persistence = await this.persistAuthorizerTokens(installation, lease, tokens, 2);
      if (persistence.status === "persisted") return refreshed.accessToken;
      if (persistence.status === "unknown") throw authorizerPersistenceRecoverableError();
      return await this.compensateAuthorizerAccessToken(
        installation,
        lease,
        componentAccessToken,
      );
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
    return raceOperation({ operation: read, timeout: remaining,
      setTimer: this.setTimeout, clearTimer: this.clearTimeout,
      timeoutError: pollTimeoutError });
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

  private async persistAuthorizerTokens(
    installation: DouyinMiniappInstallationRecord,
    lease: DouyinRefreshLease,
    tokens: SealedAuthorizerTokens,
    attempts: number,
  ): Promise<PersistenceOutcome> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!isStrictlyFuture(lease.claimExpiresAt, this.now())) {
        return { status: "unknown" };
      }
      let completion: boolean | "unknown" = "unknown";
      try {
        completion = await this.runPersistenceOperation(
          () => this.options.installationRepository.completeAccessTokenRefresh({
            installationId: installation.id,
            claimToken: lease.claimToken,
            ...tokens,
          }),
          lease,
        );
        if (completion) return { status: "persisted" };
      } catch { completion = "unknown"; }
      if (!isStrictlyFuture(lease.claimExpiresAt, this.now())) {
        return { status: "unknown" };
      }
      let row: DouyinMiniappInstallationRecord | null;
      try {
        row = await this.runPersistenceOperation(
          () => this.options.installationRepository.findActiveMerchant(
            installation.authorizer_appid,
            requiredDeploymentKey(installation),
          ),
          lease,
        );
      } catch {
        return { status: "unknown" };
      }
      if (row && matchesPersistedTokens(row, tokens)) {
        return { status: "persisted" };
      }
      if (completion === "unknown") return { status: "unknown" };
    }
    return { status: "explicitly_rejected" };
  }

  private async compensateAuthorizerAccessToken(
    installation: DouyinMiniappInstallationRecord,
    lease: DouyinRefreshLease,
    componentAccessToken: string,
  ): Promise<string> {
    if (!hasLeaseHeadroom(lease.claimExpiresAt, this.now(), RECOVERY_START_HEADROOM_MS)) {
      throw authorizerPersistenceRecoverableError();
    }
    const authorizationCode = await this.options.openPlatform.retrieveAuthorizationCode({
      componentAccessToken,
      authorizationAppId: installation.authorizer_appid,
    });
    if (!hasLeaseHeadroom(lease.claimExpiresAt, this.now(), RECOVERY_EXCHANGE_HEADROOM_MS)) {
      throw authorizerPersistenceRecoverableError();
    }
    const recovered = await this.options.openPlatform.exchangeAuthorizationCode({
      componentAccessToken,
      authorizationCode,
    });
    assertAuthorizerAppId(recovered, installation.authorizer_appid);
    const tokens = {
      accessToken: this.sealToken(recovered.accessToken, recovered.expiresIn),
      refreshToken: this.sealRefreshToken(recovered),
    };
    const persistence = await this.persistAuthorizerTokens(installation, lease, tokens, 1);
    if (persistence.status !== "persisted") throw authorizerPersistenceRecoverableError();
    return recovered.accessToken;
  }

  private runPersistenceOperation<Result>(
    operation: () => Promise<Result>,
    lease: DouyinRefreshLease,
  ): Promise<Result> {
    const leaseRemaining = Date.parse(lease.claimExpiresAt) - this.now();
    const timeout = Math.min(PERSISTENCE_OPERATION_TIMEOUT_MS, leaseRemaining);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return Promise.reject(authorizerPersistenceRecoverableError());
    }
    return raceOperation({ operation, timeout, setTimer: this.setTimeout,
      clearTimer: this.clearTimeout,
      timeoutError: persistenceOperationTimeoutError });
  }

  private async bestEffortFailComponentLease(
    claimToken: string,
    errorCode: string,
  ): Promise<void> {
    await this.settleBestEffort(
      () => this.options.componentRepository.failAccessTokenRefresh({
        componentAppId: this.options.componentAppId,
        claimToken,
        errorCode,
      }),
    );
  }

  private async bestEffortFailAuthorizerLease(
    installationId: string,
    claimToken: string,
    errorCode: string,
  ): Promise<void> {
    await this.settleBestEffort(
      () => this.options.installationRepository.failAccessTokenRefresh({
        installationId,
        claimToken,
        errorCode,
      }),
    );
  }

  private settleBestEffort(operation: () => Promise<unknown>): Promise<void> {
    return settleBestEffortWithin({ operation, timeout: BEST_EFFORT_FAIL_TIMEOUT_MS,
      setTimer: this.setTimeout, clearTimer: this.clearTimeout });
  }
}

function sleepWithTimer(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
