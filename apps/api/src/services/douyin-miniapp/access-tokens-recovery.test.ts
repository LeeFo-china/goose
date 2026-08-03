import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createSecretKey } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type { DouyinOpenPlatformGateway } from "@/gateways/douyin-open-platform/client";
import type { DouyinThirdPartyComponentRecord } from "@/repositories/douyin-third-party-components";
import type { DouyinMiniappInstallationRecord } from "@/repositories/douyin-miniapp-installations";
import { sealDouyinCredential, type DouyinCredentialKeyring } from "./credential-envelope";
import type { AuthorizerTokenRepository, ComponentTokenRepository } from "./access-tokens";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappAccessTokenService:
  typeof import("./access-tokens").DouyinMiniappAccessTokenService;
beforeAll(async () => ({ DouyinMiniappAccessTokenService } = await import("./access-tokens")));

const NOW_MS = Date.parse("2026-07-20T00:00:00.000Z");
const CLAIM_TOKEN = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const keyring: DouyinCredentialKeyring = {
  activeKeyVersion: "v1",
  keys: { v1: createSecretKey(Buffer.alloc(32, 0x55)) },
};

function sealed(plaintext: string) { return sealDouyinCredential(plaintext, keyring); }

function componentRow(accessToken?: string): DouyinThirdPartyComponentRecord {
  const ticket = sealed("ticket-secret");
  const access = accessToken ? sealed(accessToken) : null;
  return {
    component_appid: "component-appid",
    component_ticket_ciphertext: ticket.ciphertext,
    component_ticket_iv: ticket.iv,
    component_ticket_tag: ticket.tag,
    component_ticket_key_version: ticket.keyVersion,
    component_ticket_received_at: new Date(NOW_MS).toISOString(),
    access_token_ciphertext: access?.ciphertext ?? null,
    access_token_iv: access?.iv ?? null,
    access_token_tag: access?.tag ?? null,
    access_token_key_version: access?.keyVersion ?? null,
    access_token_expires_at: access ? new Date(NOW_MS + 600_000).toISOString() : null,
    token_refresh_claim_token: null,
    token_refresh_claim_expires_at: null,
  };
}

function installationRow(): DouyinMiniappInstallationRecord {
  const refresh = sealed("refresh-secret");
  return {
    id: INSTALLATION_ID,
    tenant_id: "33333333-3333-4333-8333-333333333333",
    component_appid: "component-appid",
    authorizer_appid: "authorizer-appid",
    deployment_key: "merchant-a",
    installation_kind: "merchant",
    authorization_status: "active",
    access_token_ciphertext: null,
    access_token_iv: null,
    access_token_tag: null,
    access_token_key_version: null,
    access_token_expires_at: null,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    refresh_token_tag: refresh.tag,
    refresh_token_key_version: refresh.keyVersion,
    refresh_token_expires_at: new Date(NOW_MS + 600_000).toISOString(),
    permission_snapshot: [],
    token_refresh_claim_token: null,
    token_refresh_claim_expires_at: null,
  };
}

function emptyInstallations(): AuthorizerTokenRepository {
  return {
    findActiveMerchant: mock(async () => null),
    claimAccessTokenRefresh: mock(async () => null),
    completeAccessTokenRefresh: mock(async () => false),
    failAccessTokenRefresh: mock(async () => false),
  };
}

function gateway(overrides: Partial<DouyinOpenPlatformGateway> = {}): DouyinOpenPlatformGateway {
  return {
    getComponentAccessToken: mock(async () => ({ accessToken: "component-token", expiresIn: 7200 })),
    exchangeAuthorizationCode: mock(async () => ({ accessToken: "recovered-token",
      authorizerAppId: "authorizer-appid", refreshToken: "recovered-refresh", expiresIn: 7200,
      refreshExpiresIn: 2_592_000, permissions: [] })),
    refreshAuthorizerToken: mock(async () => ({ accessToken: "refreshed-token",
      authorizerAppId: "authorizer-appid", refreshToken: "rotated-refresh", expiresIn: 7200,
      refreshExpiresIn: 2_592_000, permissions: [] })),
    retrieveAuthorizationCode: mock(async () => "replacement-code"),
    generateAuthorizationLink: mock(async () => ({
      link: "https://open.douyin.com/authorize/unused",
      logId: "unused-log",
    })),
    code2Session: mock(async () => ({ sessionKey: "unused", openId: "unused" })),
    code2SessionForTemplate: mock(async () => ({ sessionKey: "unused", openId: "unused" })),
    ...overrides,
  };
}

function manualTimers() {
  const timers: Array<{ callback: () => void; cleared: boolean }> = [];
  const clearTimeout = mock((handle: ReturnType<typeof globalThis.setTimeout>) => {
    const timer = timers[Number(handle) - 1];
    if (timer) timer.cleared = true;
  });
  const setTimeout = mock((callback: () => void, _milliseconds: number) => {
    timers.push({ callback, cleared: false });
    return timers.length as unknown as ReturnType<typeof globalThis.setTimeout>;
  });
  const fireNext = () => {
    const timer = timers.find((candidate) => !candidate.cleared);
    timer?.callback();
  };
  return { setTimeout, clearTimeout, fireNext };
}

type CompletionInput = Parameters<AuthorizerTokenRepository["completeAccessTokenRefresh"]>[0];

function persistedInstallation(input: CompletionInput): DouyinMiniappInstallationRecord {
  return {
    ...installationRow(),
    access_token_ciphertext: input.accessToken.ciphertext,
    access_token_iv: input.accessToken.iv,
    access_token_tag: input.accessToken.tag,
    access_token_key_version: input.accessToken.keyVersion,
    access_token_expires_at: input.accessToken.expiresAt,
    refresh_token_ciphertext: input.refreshToken.ciphertext,
    refresh_token_iv: input.refreshToken.iv,
    refresh_token_tag: input.refreshToken.tag,
    refresh_token_key_version: input.refreshToken.keyVersion,
    refresh_token_expires_at: input.refreshToken.expiresAt,
  };
}

function authorizerService(
  installationRepository: AuthorizerTokenRepository,
  openPlatform = gateway(),
  options: { now?: () => number; timers?: ReturnType<typeof manualTimers> } = {},
) {
  const componentRepository: ComponentTokenRepository = {
    findActive: mock(async () => componentRow("component-token")),
    claimAccessTokenRefresh: mock(async () => null),
    completeAccessTokenRefresh: mock(async () => false),
    failAccessTokenRefresh: mock(async () => false),
  };
  return new DouyinMiniappAccessTokenService({
    componentAppId: "component-appid", componentAppSecret: "component-secret",
    credentialKeyring: keyring, componentRepository, installationRepository, openPlatform,
    now: options.now ?? (() => NOW_MS), sleep: async () => undefined,
    setTimeout: options.timers?.setTimeout, clearTimeout: options.timers?.clearTimeout,
  });
}

function authorizerRepository(overrides: Partial<AuthorizerTokenRepository>): AuthorizerTokenRepository {
  return {
    findActiveMerchant: mock(async () => installationRow()),
    claimAccessTokenRefresh: mock(async () => ({ claimToken: CLAIM_TOKEN,
      claimExpiresAt: new Date(NOW_MS + 30_000).toISOString() })),
    completeAccessTokenRefresh: mock(async () => true),
    failAccessTokenRefresh: mock(async () => false),
    ...overrides,
  };
}

describe("DouyinMiniappAccessTokenService recovery boundaries", () => {
  test("force-refreshes a provider-rejected merchant token under the database lease", async () => {
    const rejected = sealed("provider-rejected-token");
    const row = {
      ...installationRow(),
      access_token_ciphertext: rejected.ciphertext,
      access_token_iv: rejected.iv,
      access_token_tag: rejected.tag,
      access_token_key_version: rejected.keyVersion,
      access_token_expires_at: new Date(NOW_MS + 301_000).toISOString(),
    };
    const claim = mock(async () => ({ claimToken: CLAIM_TOKEN,
      claimExpiresAt: new Date(NOW_MS + 30_000).toISOString() }));
    const repository = authorizerRepository({
      findActiveMerchant: mock(async () => row),
      claimAccessTokenRefresh: claim,
    });
    const openPlatform = gateway();

    await expect(authorizerService(repository, openPlatform)
      .forceRefreshAuthorizerAccessToken({ authorizerAppId: "authorizer-appid",
        deploymentKey: "merchant-a", rejectedAccessToken: "provider-rejected-token" }))
      .resolves.toBe("refreshed-token");
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(INSTALLATION_ID, {
      expectedAccessTokenCiphertext: rejected.ciphertext,
    });
    expect(openPlatform.refreshAuthorizerToken).toHaveBeenCalledTimes(1);
  });

  test("bounds a stalled fail RPC and consumes its late rejection without masking the original error", async () => {
    let rejectLate: (error: unknown) => void = () => undefined;
    const stalledFail = new Promise<boolean>((_resolve, reject) => { rejectLate = reject; });
    const original = Errors.business(502, "gateway unavailable", "DOUYIN_OPEN_PLATFORM_NETWORK_ERROR");
    const componentRepository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => ({ claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 30_000).toISOString() })),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => stalledFail),
    };
    const timers = manualTimers();
    const service = new DouyinMiniappAccessTokenService({
      componentAppId: "component-appid", componentAppSecret: "component-secret", credentialKeyring: keyring,
      componentRepository, installationRepository: emptyInstallations(),
      openPlatform: gateway({ getComponentAccessToken: mock(async () => { throw original; }) }),
      now: () => NOW_MS, sleep: async () => undefined,
      setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    });

    const pending = service.getComponentAccessToken();
    await Bun.sleep(0);
    timers.fireNext();
    const outcome = await Promise.race([
      pending.then(() => "resolved", (error) => error),
      Bun.sleep(10).then(() => "still-pending"),
    ]);
    expect(outcome).toBe(original);
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
    expect(timers.clearTimeout).toHaveBeenCalled();
    rejectLate(new TypeError("late database rejection"));
    await Bun.sleep(0);
    await expect(pending).rejects.toBe(original);
  });

  test("accepts exact readback when a committed completion response rejects", async () => {
    const repositoryError = Errors.business(
      500, "repository unavailable", "DOUYIN_INSTALLATION_REPOSITORY_ERROR",
    );
    let completion: CompletionInput | undefined;
    const complete = mock(async (input: CompletionInput) => {
      completion = input;
      throw repositoryError;
    });
    let reads = 0;
    const find = mock(async () => {
      reads += 1;
      if (reads === 1 || !completion) return installationRow();
      return persistedInstallation(completion);
    });
    const repository = authorizerRepository({
      findActiveMerchant: find,
      completeAccessTokenRefresh: complete,
    });

    await expect(authorizerService(repository).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).resolves.toBe("refreshed-token");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
  });

  test("retries once after a false completion and mismatched readback", async () => {
    const complete = mock(async (_input: CompletionInput) => true).mockResolvedValueOnce(false);
    const find = mock(async () => installationRow());
    const repository = authorizerRepository({
      findActiveMerchant: find,
      completeAccessTokenRefresh: complete,
    });

    await expect(authorizerService(repository).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).resolves.toBe("refreshed-token");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledTimes(2);
  });

  test("does not retry, compensate, or fail the lease after a thrown completion and mismatched readback", async () => {
    const repositoryError = Errors.business(
      500, "database unavailable", "DOUYIN_INSTALLATION_REPOSITORY_ERROR",
    );
    const complete = mock(async (_input: CompletionInput) => { throw repositoryError; });
    const repository = authorizerRepository({ completeAccessTokenRefresh: complete });
    const openPlatform = gateway();

    await expect(authorizerService(repository, openPlatform).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).rejects.toMatchObject({
      statusCode: 503, code: "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE",
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(openPlatform.retrieveAuthorizationCode).not.toHaveBeenCalled();
    expect(openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(repository.failAccessTokenRefresh).not.toHaveBeenCalled();
  });

  test("times out a stalled completion and accepts the committed readback", async () => {
    let completion: CompletionInput | undefined;
    const complete = mock((input: CompletionInput) => {
      completion = input;
      return new Promise<boolean>(() => undefined);
    });
    let reads = 0;
    const find = mock(async () => {
      reads += 1;
      if (reads === 1 || !completion) return installationRow();
      return persistedInstallation(completion);
    });
    const timers = manualTimers();
    const pending = authorizerService(authorizerRepository({
      findActiveMerchant: find, completeAccessTokenRefresh: complete,
    }), gateway(), { timers }).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    });

    await Bun.sleep(0);
    timers.fireNext();
    const outcome = await Promise.race([pending, Bun.sleep(10).then(() => "still-pending")]);
    expect(outcome).toBe("refreshed-token");
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1_000);
    expect(timers.clearTimeout).toHaveBeenCalled();
  });

  test("does not issue another write or compensation while a timed-out completion may land late", async () => {
    let resolveLate: (completed: boolean) => void = () => undefined;
    const complete = mock((_input: CompletionInput) => new Promise<boolean>((resolve) => {
      resolveLate = resolve;
    }));
    const timers = manualTimers();
    const openPlatform = gateway();
    const repository = authorizerRepository({
      completeAccessTokenRefresh: complete,
    });
    const pending = authorizerService(repository, openPlatform, { timers }).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    });

    await Bun.sleep(0);
    timers.fireNext();
    const outcome = await Promise.race([
      pending.then(() => "resolved", (error) => error),
      Bun.sleep(10).then(() => "still-pending"),
    ]);
    expect(outcome).not.toBe("resolved");
    expect(outcome).toMatchObject({
      statusCode: 503, code: "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE",
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(openPlatform.retrieveAuthorizationCode).not.toHaveBeenCalled();
    expect(openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(repository.failAccessTokenRefresh).not.toHaveBeenCalled();
    resolveLate(true);
    await Bun.sleep(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test("does not retry or compensate when an exact readback times out", async () => {
    const complete = mock(async (_input: CompletionInput) => true).mockResolvedValueOnce(false);
    let reads = 0;
    const find = mock(async () => {
      reads += 1;
      if (reads === 1) return installationRow();
      return new Promise<DouyinMiniappInstallationRecord | null>(() => undefined);
    });
    const timers = manualTimers();
    const repository = authorizerRepository({
      findActiveMerchant: find, completeAccessTokenRefresh: complete,
    });
    const openPlatform = gateway();
    const pending = authorizerService(repository, openPlatform, { timers }).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    });

    await Bun.sleep(0);
    timers.fireNext();
    await expect(pending).rejects.toMatchObject({
      statusCode: 503, code: "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE",
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
    expect(openPlatform.retrieveAuthorizationCode).not.toHaveBeenCalled();
    expect(openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(repository.failAccessTokenRefresh).not.toHaveBeenCalled();
  });

  test("runs one official compensation chain after two explicitly rejected completions", async () => {
    const complete = mock(async (_input: CompletionInput) => true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const repository = authorizerRepository({ completeAccessTokenRefresh: complete });
    const openPlatform = gateway();

    await expect(authorizerService(repository, openPlatform).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).resolves.toBe("recovered-token");
    expect(openPlatform.refreshAuthorizerToken).toHaveBeenCalledTimes(1);
    expect(openPlatform.retrieveAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(openPlatform.retrieveAuthorizationCode).toHaveBeenCalledWith({
      componentAccessToken: "component-token", authorizationAppId: "authorizer-appid",
    });
    expect(openPlatform.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(openPlatform.exchangeAuthorizationCode).toHaveBeenCalledWith({
      componentAccessToken: "component-token", authorizationCode: "replacement-code",
    });
    expect(complete).toHaveBeenCalledTimes(3);
  });

  test("does not repeat compensation when retrieving a replacement code fails", async () => {
    const recoveryFailure = Errors.business(
      502, "recovery unavailable", "DOUYIN_OPEN_PLATFORM_API_ERROR",
    );
    const complete = mock(async (_input: CompletionInput) => false);
    const openPlatform = gateway({
      retrieveAuthorizationCode: mock(async () => { throw recoveryFailure; }),
    });

    await expect(authorizerService(authorizerRepository({
      completeAccessTokenRefresh: complete,
    }), openPlatform).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).rejects.toBe(recoveryFailure);
    expect(openPlatform.retrieveAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  test("returns a recoverable error after persistent database failure without unbounded calls", async () => {
    const repositoryError = Errors.business(
      500, "database unavailable", "DOUYIN_INSTALLATION_REPOSITORY_ERROR",
    );
    const complete = mock(async (_input: CompletionInput) => { throw repositoryError; });
    const find = mock(async (): Promise<DouyinMiniappInstallationRecord | null> => {
      throw repositoryError;
    })
      .mockResolvedValueOnce(installationRow());
    const openPlatform = gateway();
    const repository = authorizerRepository({
      findActiveMerchant: find, completeAccessTokenRefresh: complete,
    });

    await expect(authorizerService(repository, openPlatform).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).rejects.toMatchObject({
      statusCode: 503, code: "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE",
    });
    expect(openPlatform.retrieveAuthorizationCode).not.toHaveBeenCalled();
    expect(openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
    expect(repository.failAccessTokenRefresh).not.toHaveBeenCalled();
  });

  test("does not start compensation without headroom or after the lease expires", async () => {
    for (const fixture of [
      { claimExpiresAt: NOW_MS + 21_999, advanceToExpiry: false },
      { claimExpiresAt: NOW_MS + 30_000, advanceToExpiry: true },
    ]) {
      let time = NOW_MS;
      const complete = mock(async (_input: CompletionInput) => {
        if (fixture.advanceToExpiry) time = fixture.claimExpiresAt;
        return false;
      });
      const repository = authorizerRepository({
        claimAccessTokenRefresh: mock(async () => ({ claimToken: CLAIM_TOKEN,
          claimExpiresAt: new Date(fixture.claimExpiresAt).toISOString() })),
        completeAccessTokenRefresh: complete,
      });
      const openPlatform = gateway();
      await expect(authorizerService(repository, openPlatform, { now: () => time })
        .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
        .rejects.toMatchObject({ code: "DOUYIN_AUTHORIZER_TOKEN_PERSISTENCE_RECOVERABLE" });
      expect(openPlatform.retrieveAuthorizationCode).not.toHaveBeenCalled();
      if (fixture.advanceToExpiry) expect(repository.findActiveMerchant).toHaveBeenCalledTimes(1);
    }
  });

  test("uses one compensation chain when the provider rejects a stale refresh token", async () => {
    const staleRefresh = Errors.business(
      502, "refresh rejected", "DOUYIN_OPEN_PLATFORM_API_ERROR",
    );
    const openPlatform = gateway({
      refreshAuthorizerToken: mock(async () => { throw staleRefresh; }),
    });
    const complete = mock(async (_input: CompletionInput) => true);

    await expect(authorizerService(authorizerRepository({
      completeAccessTokenRefresh: complete,
    }), openPlatform).getAuthorizerAccessToken({
      authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a",
    })).resolves.toBe("recovered-token");
    expect(openPlatform.refreshAuthorizerToken).toHaveBeenCalledTimes(1);
    expect(openPlatform.retrieveAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(openPlatform.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
