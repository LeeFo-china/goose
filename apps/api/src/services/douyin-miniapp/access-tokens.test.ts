import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createSecretKey } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type { DouyinOpenPlatformGateway } from "@/gateways/douyin-open-platform/client";
import type { DouyinThirdPartyComponentRecord } from "@/repositories/douyin-third-party-components";
import type { DouyinMiniappInstallationRecord } from "@/repositories/douyin-miniapp-installations";
import {
  openDouyinCredential,
  sealDouyinCredential,
  type DouyinCredentialKeyring,
} from "./credential-envelope";
import type {
  ComponentTokenRepository,
  AuthorizerTokenRepository,
} from "./access-tokens";

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
  activeKeyVersion: "v1", keys: { v1: createSecretKey(Buffer.alloc(32, 0x33)) },
};
function envelope(plaintext: string) { return sealDouyinCredential(plaintext, keyring); }
function componentRow(options: { accessToken?: string; expiresAt?: string } = {}): DouyinThirdPartyComponentRecord {
  const ticket = envelope("ticket-secret");
  const access = options.accessToken ? envelope(options.accessToken) : null;
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
    access_token_expires_at: options.expiresAt ?? null,
    token_refresh_claim_token: null,
    token_refresh_claim_expires_at: null,
  };
}
function installationRow(options: {
  accessToken?: string; expiresAt?: string; componentAppId?: string; refreshExpiresAt?: string;
} = {}): DouyinMiniappInstallationRecord {
  const access = options.accessToken ? envelope(options.accessToken) : null;
  const refresh = envelope("refresh-secret");
  return {
    id: INSTALLATION_ID,
    tenant_id: "33333333-3333-4333-8333-333333333333",
    component_appid: options.componentAppId ?? "component-appid",
    authorizer_appid: "authorizer-appid",
    deployment_key: "merchant-a",
    installation_kind: "merchant",
    authorization_status: "active",
    access_token_ciphertext: access?.ciphertext ?? null,
    access_token_iv: access?.iv ?? null,
    access_token_tag: access?.tag ?? null,
    access_token_key_version: access?.keyVersion ?? null,
    access_token_expires_at: options.expiresAt ?? null,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    refresh_token_tag: refresh.tag,
    refresh_token_key_version: refresh.keyVersion,
    refresh_token_expires_at: options.refreshExpiresAt ?? "2026-08-20T00:00:00.000Z",
    permission_snapshot: [],
    token_refresh_claim_token: null,
    token_refresh_claim_expires_at: null,
  };
}

function gateway(overrides: Partial<DouyinOpenPlatformGateway> = {}): DouyinOpenPlatformGateway {
  return {
    getComponentAccessToken: mock(async () => ({ accessToken: "new-component-token", expiresIn: 7200 })),
    exchangeAuthorizationCode: mock(async () => ({ accessToken: "unused", authorizerAppId: "unused",
      refreshToken: "unused", expiresIn: 1, refreshExpiresIn: 1, permissions: [] })),
    refreshAuthorizerToken: mock(async () => ({
      accessToken: "new-authorizer-token", authorizerAppId: "authorizer-appid",
      refreshToken: "rotated-refresh-token", expiresIn: 7200,
      refreshExpiresIn: 2_592_000, permissions: [],
    })),
    code2Session: mock(async () => ({ sessionKey: "unused", openId: "unused" })),
    code2SessionForTemplate: mock(async () => ({ sessionKey: "unused", openId: "unused" })),
    ...overrides,
  };
}

function service(input: { componentRepository: ComponentTokenRepository;
  installationRepository?: AuthorizerTokenRepository; openPlatform?: DouyinOpenPlatformGateway;
  now?: () => number; sleep?: (milliseconds: number) => Promise<void> }) {
  return new DouyinMiniappAccessTokenService({
    componentAppId: "component-appid",
    componentAppSecret: "component-secret",
    credentialKeyring: keyring,
    componentRepository: input.componentRepository,
    installationRepository: input.installationRepository ?? emptyInstallationRepository(),
    openPlatform: input.openPlatform ?? gateway(),
    now: input.now ?? (() => NOW_MS),
    sleep: input.sleep ?? (async () => undefined),
  });
}

function emptyInstallationRepository(): AuthorizerTokenRepository {
  return {
    findActiveMerchant: mock(async () => null),
    claimAccessTokenRefresh: mock(async () => null),
    completeAccessTokenRefresh: mock(async () => false),
    failAccessTokenRefresh: mock(async () => false),
  };
}

describe("DouyinMiniappAccessTokenService fast paths", () => {
  test("decrypts and returns a component token valid for more than five minutes without claiming", async () => {
    const claim = mock(async () => null);
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow({
        accessToken: "stored-component-token",
        expiresAt: new Date(NOW_MS + 301_000).toISOString(),
      })),
      claimAccessTokenRefresh: claim,
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };

    await expect(service({ componentRepository: repository }).getComponentAccessToken())
      .resolves.toBe("stored-component-token");
    expect(claim).not.toHaveBeenCalled();
  });

  test("decrypts and returns a valid merchant token without claiming", async () => {
    const componentRepository = validComponentRepository();
    const claim = mock(async () => null);
    const installationRepository: AuthorizerTokenRepository = {
      findActiveMerchant: mock(async () => installationRow({
        accessToken: "stored-authorizer-token",
        expiresAt: new Date(NOW_MS + 301_000).toISOString(),
      })),
      claimAccessTokenRefresh: claim,
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };

    await expect(service({ componentRepository, installationRepository })
      .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
      .resolves.toBe("stored-authorizer-token");
    expect(claim).not.toHaveBeenCalled();
  });

  test("rejects an installation bound to another component before decrypt or external calls", async () => {
    const componentRepository = validComponentRepository();
    const openPlatform = gateway();
    const installationRepository: AuthorizerTokenRepository = {
      findActiveMerchant: mock(async () => installationRow({
        accessToken: "stored-authorizer-token",
        expiresAt: new Date(NOW_MS + 301_000).toISOString(),
        componentAppId: "other-component-appid",
      })),
      claimAccessTokenRefresh: mock(async () => null),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };

    await expect(service({ componentRepository, installationRepository, openPlatform })
      .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
      .rejects.toMatchObject({ code: "DOUYIN_COMPONENT_APP_ID_MISMATCH" });
    expect(componentRepository.findActive).not.toHaveBeenCalled();
    expect(openPlatform.refreshAuthorizerToken).not.toHaveBeenCalled();
    expect(installationRepository.claimAccessTokenRefresh).not.toHaveBeenCalled();
  });
});

describe("DouyinMiniappAccessTokenService lease orchestration", () => {
  test("seals refreshed component credentials and completes the matching lease", async () => {
    const complete = mock(async (
      _input: Parameters<ComponentTokenRepository["completeAccessTokenRefresh"]>[0],
    ) => true);
    const openPlatform = gateway();
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 30_000).toISOString(),
      })),
      completeAccessTokenRefresh: complete,
      failAccessTokenRefresh: mock(async () => false),
    };

    await expect(service({ componentRepository: repository, openPlatform }).getComponentAccessToken())
      .resolves.toBe("new-component-token");
    expect(openPlatform.getComponentAccessToken).toHaveBeenCalledWith({
      componentAppId: "component-appid",
      componentAppSecret: "component-secret",
      componentTicket: "ticket-secret",
    });
    const completion = complete.mock.calls[0]?.[0];
    expect(completion?.claimToken).toBe(CLAIM_TOKEN);
    expect(completion?.accessToken.expiresAt).toBe(new Date(NOW_MS + 7_200_000).toISOString());
    expect(openDouyinCredential(completion!.accessToken, keyring)).toBe("new-component-token");
  });

  test("two concurrent callers trigger only one gateway refresh", async () => {
    let row = componentRow();
    let claimed = false;
    let releaseGateway: (() => void) | undefined;
    let time = NOW_MS;
    const gatewayWait = new Promise<void>((resolve) => { releaseGateway = resolve; });
    const openPlatform = gateway({
      getComponentAccessToken: mock(async () => {
        await gatewayWait;
        return { accessToken: "new-component-token", expiresIn: 7200 };
      }),
    });
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => row),
      claimAccessTokenRefresh: mock(async () => {
        if (claimed) return null;
        claimed = true;
        return { claimToken: CLAIM_TOKEN, claimExpiresAt: new Date(NOW_MS + 30_000).toISOString() };
      }),
      completeAccessTokenRefresh: mock(async (input) => {
        row = {
          ...row,
          access_token_ciphertext: input.accessToken.ciphertext,
          access_token_iv: input.accessToken.iv,
          access_token_tag: input.accessToken.tag,
          access_token_key_version: input.accessToken.keyVersion,
          access_token_expires_at: input.accessToken.expiresAt,
        };
        return true;
      }),
      failAccessTokenRefresh: mock(async () => false),
    };
    const tokenService = service({
      componentRepository: repository,
      openPlatform,
      now: () => time,
      sleep: async () => {
        time += 100;
        releaseGateway?.();
        await Promise.resolve();
      },
    });

    const [first, second] = await Promise.all([
      tokenService.getComponentAccessToken(),
      tokenService.getComponentAccessToken(),
    ]);
    expect([first, second]).toEqual(["new-component-token", "new-component-token"]);
    expect(openPlatform.getComponentAccessToken).toHaveBeenCalledTimes(1);
  });

  test("fails closed on completion mismatch and bounded poll timeout", async () => {
    const mismatchRepository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 30_000).toISOString(),
      })),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };
    await expect(service({ componentRepository: mismatchRepository }).getComponentAccessToken())
      .rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_LEASE_MISMATCH" });

    let time = NOW_MS;
    let sleeps = 0;
    const pollingRepository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => null),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };
    await expect(service({
      componentRepository: pollingRepository,
      now: () => time,
      sleep: async (milliseconds) => { time += milliseconds; sleeps += 1; },
    }).getComponentAccessToken()).rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT" });
    expect(time - NOW_MS).toBe(3_000);
    expect(sleeps).toBe(30);
  });

  test("rejects expired or invalid refresh-token expiry before decrypt and best-effort fails the lease", async () => {
    for (const refreshExpiresAt of [new Date(NOW_MS).toISOString(), "invalid-date"]) {
      const componentRepository = validComponentRepository();
      const openPlatform = gateway();
      const complete = mock(async () => true);
      const fail = mock(async () => {
        throw Errors.business(500, "database unavailable", "DOUYIN_INSTALLATION_REPOSITORY_ERROR");
      });
      const installationRepository: AuthorizerTokenRepository = {
        findActiveMerchant: mock(async () => installationRow({ refreshExpiresAt })),
        claimAccessTokenRefresh: mock(async () => ({
          claimToken: CLAIM_TOKEN,
          claimExpiresAt: new Date(NOW_MS + 30_000).toISOString(),
        })),
        completeAccessTokenRefresh: complete,
        failAccessTokenRefresh: fail,
      };

      await expect(service({ componentRepository, installationRepository, openPlatform })
        .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
        .rejects.toMatchObject({ code: "DOUYIN_AUTHORIZATION_EXPIRED" });
      expect(componentRepository.findActive).not.toHaveBeenCalled();
      expect(openPlatform.refreshAuthorizerToken).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(fail).toHaveBeenCalledWith({
        installationId: INSTALLATION_ID,
        claimToken: CLAIM_TOKEN,
        errorCode: "DOUYIN_AUTHORIZATION_EXPIRED",
      });
    }
  });

  test("requires more than the gateway timeout window on component and authorizer leases", async () => {
    const componentGateway = gateway();
    const componentComplete = mock(async () => true);
    const componentRepository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 10_000).toISOString(),
      })),
      completeAccessTokenRefresh: componentComplete,
      failAccessTokenRefresh: mock(async () => {
        throw Errors.business(500, "database unavailable", "DOUYIN_COMPONENT_REPOSITORY_ERROR");
      }),
    };
    await expect(service({ componentRepository, openPlatform: componentGateway })
      .getComponentAccessToken())
      .rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT" });
    expect(componentGateway.getComponentAccessToken).not.toHaveBeenCalled();
    expect(componentComplete).not.toHaveBeenCalled();

    let time = NOW_MS;
    const nestedComponentRepository = validComponentRepository();
    nestedComponentRepository.findActive = mock(async () => {
      time += 16_000;
      return componentRow({
        accessToken: "stored-component-token",
        expiresAt: new Date(NOW_MS + 1_000_000).toISOString(),
      });
    });
    const authorizerGateway = gateway();
    const authorizerComplete = mock(async () => true);
    const installationRepository: AuthorizerTokenRepository = {
      findActiveMerchant: mock(async () => installationRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 25_000).toISOString(),
      })),
      completeAccessTokenRefresh: authorizerComplete,
      failAccessTokenRefresh: mock(async () => false),
    };
    await expect(service({
      componentRepository: nestedComponentRepository,
      installationRepository,
      openPlatform: authorizerGateway,
      now: () => time,
    }).getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
      .rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_LEASE_INSUFFICIENT" });
    expect(authorizerGateway.refreshAuthorizerToken).not.toHaveBeenCalled();
    expect(authorizerComplete).not.toHaveBeenCalled();
  });

  test("does not accept a token returned by a poll read that crosses the three-second deadline", async () => {
    let time = NOW_MS;
    let reads = 0;
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => {
        reads += 1;
        if (reads === 1) return componentRow();
        time += 3_000;
        return componentRow({
          accessToken: "late-component-token",
          expiresAt: new Date(NOW_MS + 1_000_000).toISOString(),
        });
      }),
      claimAccessTokenRefresh: mock(async () => null),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };
    await expect(service({
      componentRepository: repository,
      now: () => time,
      sleep: async (milliseconds) => { time += milliseconds; },
    }).getComponentAccessToken()).rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT" });
  });

  test("caps the last poll sleep and does not issue a read at the deadline", async () => {
    let time = NOW_MS;
    let reads = 0;
    const sleeps: number[] = [];
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => {
        reads += 1;
        if (reads === 2) time += 2_850;
        return componentRow();
      }),
      claimAccessTokenRefresh: mock(async () => null),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: mock(async () => false),
    };
    await expect(service({
      componentRepository: repository,
      now: () => time,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); time += milliseconds; },
    }).getComponentAccessToken()).rejects.toMatchObject({ code: "DOUYIN_TOKEN_REFRESH_POLL_TIMEOUT" });
    expect(sleeps).toEqual([100, 50]);
    expect(reads).toBe(2);
  });

  test("records a stable error code and fails closed when the fail RPC itself fails", async () => {
    const fail = mock(async () => { throw Errors.business(500, "db raw", "DOUYIN_INSTALLATION_REPOSITORY_ERROR"); });
    const repository: ComponentTokenRepository = {
      findActive: mock(async () => componentRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 30_000).toISOString(),
      })),
      completeAccessTokenRefresh: mock(async () => false),
      failAccessTokenRefresh: fail,
    };
    const openPlatform = gateway({
      getComponentAccessToken: mock(async () => { throw Errors.business(502, "gateway raw", "DOUYIN_OPEN_PLATFORM_API_ERROR"); }),
    });

    await expect(service({ componentRepository: repository, openPlatform }).getComponentAccessToken())
      .rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_API_ERROR" });
    expect(fail).toHaveBeenCalledWith({
      componentAppId: "component-appid",
      claimToken: CLAIM_TOKEN,
      errorCode: "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED",
    });
  });

  test("rotates authorizer refresh credentials and preserves transient gateway failures", async () => {
    const componentRepository = validComponentRepository();
    const complete = mock(async (
      _input: Parameters<AuthorizerTokenRepository["completeAccessTokenRefresh"]>[0],
    ) => true);
    const fail = mock(async () => true);
    const installationRepository: AuthorizerTokenRepository = {
      findActiveMerchant: mock(async () => installationRow()),
      claimAccessTokenRefresh: mock(async () => ({
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 30_000).toISOString(),
      })),
      completeAccessTokenRefresh: complete,
      failAccessTokenRefresh: fail,
    };
    const successGateway = gateway();
    await expect(service({ componentRepository, installationRepository, openPlatform: successGateway })
      .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
      .resolves.toBe("new-authorizer-token");
    expect(successGateway.refreshAuthorizerToken).toHaveBeenCalledWith({
      componentAccessToken: "stored-component-token",
      authorizerRefreshToken: "refresh-secret",
    });
    const rotation = complete.mock.calls[0]?.[0]?.refreshToken;
    expect(rotation?.ciphertext).toBeString();
    if (!rotation || rotation.ciphertext === null) {
      throw Errors.business(500, "test rotation missing", "TEST_ROTATION_MISSING");
    }
    expect(openDouyinCredential(rotation, keyring)).toBe("rotated-refresh-token");

    const transientGateway = gateway({
      refreshAuthorizerToken: mock(async () => {
        throw Errors.business(502, "network safe", "DOUYIN_OPEN_PLATFORM_NETWORK_ERROR");
      }),
    });
    await expect(service({ componentRepository, installationRepository, openPlatform: transientGateway })
      .getAuthorizerAccessToken({ authorizerAppId: "authorizer-appid", deploymentKey: "merchant-a" }))
      .rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_NETWORK_ERROR" });
    expect(fail).toHaveBeenLastCalledWith({
      installationId: INSTALLATION_ID,
      claimToken: CLAIM_TOKEN,
      errorCode: "DOUYIN_AUTHORIZER_TOKEN_REFRESH_FAILED",
    });
  });
});

function validComponentRepository(): ComponentTokenRepository {
  return {
    findActive: mock(async () => componentRow({
      accessToken: "stored-component-token",
      expiresAt: new Date(NOW_MS + 301_000).toISOString(),
    })),
    claimAccessTokenRefresh: mock(async () => null),
    completeAccessTokenRefresh: mock(async () => false),
    failAccessTokenRefresh: mock(async () => false),
  };
}
