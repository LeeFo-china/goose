import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { AuthorizerTokenResult } from "@/gateways/douyin-open-platform/client";
import type {
  DouyinThirdPartyComponentRecord,
  DouyinTokenEnvelopeInput,
} from "@/repositories/douyin-third-party-components";
import type {
  AuthorizerRefreshRotation,
  DouyinMiniappInstallationRecord,
} from "@/repositories/douyin-miniapp-installations";
import type { DouyinCredentialEnvelope } from "./credential-envelope";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const MIN_LEASE_REMAINING_MS = 10_000;
export const COMPONENT_REFRESH_ERROR = "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED";
export const AUTHORIZER_REFRESH_ERROR = "DOUYIN_AUTHORIZER_TOKEN_REFRESH_FAILED";
export const AUTHORIZATION_EXPIRED_ERROR = "DOUYIN_AUTHORIZATION_EXPIRED";

export type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
export type SetTimer = (callback: () => void, milliseconds: number) => TimerHandle;
export type ClearTimer = (handle: TimerHandle) => void;
export type SealedAuthorizerTokens = {
  readonly accessToken: DouyinTokenEnvelopeInput;
  readonly refreshToken: AuthorizerRefreshRotation;
};

export function raceOperation<Result>(input: {
  readonly operation: () => Promise<Result>;
  readonly timeout: number;
  readonly setTimer: SetTimer;
  readonly clearTimer: ClearTimer;
  readonly timeoutError: () => AppError;
}): Promise<Result> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: TimerHandle | undefined;
    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) input.clearTimer(timer);
      complete();
    };
    timer = input.setTimer(
      () => settle(() => reject(input.timeoutError())),
      input.timeout,
    );
    if (settled) input.clearTimer(timer);
    Promise.resolve().then(input.operation).then(
      (result) => settle(() => resolve(result)),
      (error: unknown) => settle(() => reject(error)),
    );
  });
}

export function settleBestEffortWithin(input: {
  readonly operation: () => Promise<unknown>;
  readonly timeout: number;
  readonly setTimer: SetTimer;
  readonly clearTimer: ClearTimer;
}): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: TimerHandle | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) input.clearTimer(timer);
      resolve();
    };
    timer = input.setTimer(finish, input.timeout);
    if (settled) input.clearTimer(timer);
    Promise.resolve().then(input.operation).then(finish, finish);
  });
}

export function requiredComponentTicket(
  row: DouyinThirdPartyComponentRecord,
): DouyinCredentialEnvelope {
  return requiredEnvelope({
    ciphertext: row.component_ticket_ciphertext,
    iv: row.component_ticket_iv,
    tag: row.component_ticket_tag,
    keyVersion: row.component_ticket_key_version,
  });
}

export function requiredRefreshToken(
  row: DouyinMiniappInstallationRecord,
): DouyinCredentialEnvelope {
  return requiredEnvelope({
    ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv,
    tag: row.refresh_token_tag,
    keyVersion: row.refresh_token_key_version,
  });
}

export function requiredEnvelope(input: {
  readonly ciphertext: string | null;
  readonly iv: string | null;
  readonly tag: string | null;
  readonly keyVersion: string | null;
}): DouyinCredentialEnvelope {
  if (!input.ciphertext || !input.iv || !input.tag || !input.keyVersion) {
    throw Errors.business(500, "抖音凭证存储状态无效", "DOUYIN_CREDENTIAL_STATE_INVALID");
  }
  return { ciphertext: input.ciphertext, iv: input.iv, tag: input.tag,
    keyVersion: input.keyVersion };
}

export function requiredDeploymentKey(row: DouyinMiniappInstallationRecord): string {
  if (row.deployment_key) return row.deployment_key;
  throw Errors.business(500, "抖音授权部署标识缺失", "DOUYIN_CREDENTIAL_STATE_INVALID");
}

export function matchesPersistedTokens(
  row: DouyinMiniappInstallationRecord,
  tokens: SealedAuthorizerTokens,
): boolean {
  return row.access_token_ciphertext === tokens.accessToken.ciphertext &&
    row.access_token_iv === tokens.accessToken.iv &&
    row.access_token_tag === tokens.accessToken.tag &&
    row.access_token_key_version === tokens.accessToken.keyVersion &&
    sameInstant(row.access_token_expires_at, tokens.accessToken.expiresAt) &&
    row.refresh_token_ciphertext === tokens.refreshToken.ciphertext &&
    row.refresh_token_iv === tokens.refreshToken.iv &&
    row.refresh_token_tag === tokens.refreshToken.tag &&
    row.refresh_token_key_version === tokens.refreshToken.keyVersion &&
    sameInstant(row.refresh_token_expires_at, tokens.refreshToken.expiresAt);
}

function sameInstant(actual: string | null, expected: string | null): boolean {
  if (actual === null || expected === null) return actual === expected;
  return Date.parse(actual) === Date.parse(expected);
}

export function isValidBeyondBuffer(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + TOKEN_EXPIRY_BUFFER_MS;
}

export function isStrictlyFuture(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}

export function hasMinimumLeaseWindow(claimExpiresAt: string, now: number): boolean {
  const expiresAtMs = Date.parse(claimExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + MIN_LEASE_REMAINING_MS;
}

export function hasLeaseHeadroom(
  claimExpiresAt: string,
  now: number,
  headroom: number,
): boolean {
  const expiresAtMs = Date.parse(claimExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + headroom;
}

export function assertComponentBinding(actual: string, expected: string): void {
  if (actual !== expected) {
    throw Errors.business(409, "抖音小程序授权组件不匹配", "DOUYIN_COMPONENT_APP_ID_MISMATCH");
  }
}

export function assertAuthorizerAppId(result: AuthorizerTokenResult, expected: string): void {
  if (result.authorizerAppId !== expected) {
    throw Errors.business(502, "抖音授权小程序标识不匹配", "DOUYIN_AUTHORIZER_APP_ID_MISMATCH");
  }
}

export function isLeaseMismatch(error: unknown): boolean {
  return error instanceof AppError && error.code === "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH";
}

export function isTerminalAuthorizerRefreshError(error: unknown): boolean {
  return error instanceof AppError && [
    "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH",
    "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT",
  ].includes(error.code);
}

export function isRecoverableRefreshRejection(error: unknown): boolean {
  return error instanceof AppError && error.code === "DOUYIN_OPEN_PLATFORM_API_ERROR";
}

export function isPersistenceOperationTimeout(error: unknown): boolean {
  return error instanceof AppError &&
    error.code === "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_OPERATION_TIMEOUT";
}

export function preserveAppError(error: unknown, fallback: AppError): AppError {
  return error instanceof AppError ? error : fallback;
}

export function leaseMismatchError(): AppError {
  return Errors.business(409, "抖音凭证刷新租约已失效", "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH");
}

export function leaseInsufficientError(): AppError {
  return Errors.business(503, "抖音凭证刷新租约剩余时间不足", "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT");
}

export function componentRefreshError(): AppError {
  return Errors.business(502, "抖音组件凭证刷新失败", COMPONENT_REFRESH_ERROR);
}

export function authorizerRefreshError(): AppError {
  return Errors.business(502, "抖音授权凭证刷新失败", AUTHORIZER_REFRESH_ERROR);
}

export function authorizationExpiredError(): AppError {
  return Errors.business(401, "抖音小程序需要重新授权", AUTHORIZATION_EXPIRED_ERROR);
}

export function authorizerPersistenceRecoverableError(): AppError {
  return Errors.business(503, "抖音授权凭证暂未持久化，请重试",
    "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE");
}

export function persistenceOperationTimeoutError(): AppError {
  return Errors.business(503, "抖音授权凭证存储操作超时",
    "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_OPERATION_TIMEOUT");
}

export function pollTimeoutError(): AppError {
  return Errors.business(503, "等待抖音凭证刷新超时", "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT");
}
