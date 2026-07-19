import { createHmac } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import { DouyinMiniappSessionRequestSchema } from "@/schema/douyin-miniapp";
import {
  DouyinMiniappSessionService,
  type DouyinMiniappSessionInstallation,
} from "./session";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const SUBJECT_KEY = "subject-hash-key-at-least-32-bytes";

const request = {
  app_id: "tt-authorizer-1",
  deployment_key: "deployment-public-key",
  code: "one-time-login-code",
  launch_context: {
    entry_path: "pages/case-detail/index" as const,
    scene: "021001",
    source_type: "short_video" as const,
    campaign_code: "summer-2026",
    content_id: "video-100",
  },
};

const merchant: DouyinMiniappSessionInstallation = {
  id: INSTALLATION_ID,
  tenant_id: TENANT_ID,
  authorizer_appid: request.app_id,
  deployment_key: request.deployment_key,
  installation_kind: "merchant",
  authorization_status: "active",
  template_version: "1.0.0",
  tenant: { id: TENANT_ID, status: "active" },
};

function dependencies(
  installation: DouyinMiniappSessionInstallation | null = merchant,
) {
  const installationRepository = {
    findByAppId: mock(async (_appId: string) => installation),
  };
  const accessTokens = {
    getAuthorizerAccessToken: mock(async (_input: unknown) => "authorizer-access-token"),
  };
  const openPlatform = {
    code2Session: mock(async (_input: unknown) => ({
      sessionKey: "raw-session-key",
      openId: "raw-open-id",
    })),
    code2SessionForTemplate: mock(async (_input: unknown) => ({
      sessionKey: "raw-template-session-key",
      openId: "raw-template-open-id",
    })),
  };
  const templateAppSecretProvider = mock(() => "backend-template-secret");
  const tokenSigner = mock((_payload: unknown) => "gooes-jwt");
  return {
    installationRepository,
    accessTokens,
    openPlatform,
    templateAppId: "tt-template-1",
    templateAppSecretProvider,
    subjectHashKey: SUBJECT_KEY,
    tokenSigner,
    expiresInSeconds: () => 7200,
  };
}

describe("DouyinMiniappSessionService", () => {
  test("issues a privacy-safe merchant session through authorizer code2session V2", async () => {
    const deps = dependencies();
    const service = new DouyinMiniappSessionService(deps);

    const result = await service.exchange(request);

    expect(deps.installationRepository.findByAppId).toHaveBeenCalledWith(request.app_id);
    expect(deps.accessTokens.getAuthorizerAccessToken).toHaveBeenCalledWith({
      authorizerAppId: request.app_id,
      deploymentKey: request.deployment_key,
    });
    expect(deps.openPlatform.code2Session).toHaveBeenCalledWith({
      authorizerAccessToken: "authorizer-access-token",
      appId: request.app_id,
      code: request.code,
    });
    expect(deps.openPlatform.code2SessionForTemplate).not.toHaveBeenCalled();
    expect(deps.templateAppSecretProvider).not.toHaveBeenCalled();

    const expectedSubject = createHmac("sha256", SUBJECT_KEY)
      .update(`${request.app_id}:raw-open-id`)
      .digest("hex");
    expect(deps.tokenSigner).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      douyin_installation_id: INSTALLATION_ID,
      douyin_app_id: request.app_id,
      subject_hash: expectedSubject,
    });
    expect(result).toEqual({
      access_token: "gooes-jwt",
      expires_in: 7200,
      installation: { status: "active", template_version: "1.0.0" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /tenant_id|installation_id|app_id|open.?id|session.?key|deployment/i,
    );
  });

  test("uses ordinary code2Session only for the explicit template-development AppID", async () => {
    const template = {
      ...merchant,
      authorizer_appid: "tt-template-1",
      deployment_key: null,
      installation_kind: "template_development" as const,
    };
    const deps = dependencies(template);
    const service = new DouyinMiniappSessionService(deps);

    await service.exchange({ ...request, app_id: "tt-template-1", deployment_key: undefined });

    expect(deps.accessTokens.getAuthorizerAccessToken).not.toHaveBeenCalled();
    expect(deps.openPlatform.code2Session).not.toHaveBeenCalled();
    expect(deps.templateAppSecretProvider).toHaveBeenCalledTimes(1);
    expect(deps.openPlatform.code2SessionForTemplate).toHaveBeenCalledWith({
      appId: "tt-template-1",
      appSecret: "backend-template-secret",
      code: request.code,
    });
  });

  test("uses anonymous OpenID only when normal OpenID is absent", async () => {
    const deps = dependencies();
    deps.openPlatform.code2Session = mock(async () => ({
      sessionKey: "raw-session-key",
      anonymousOpenId: "raw-anonymous-open-id",
    })) as never;
    const service = new DouyinMiniappSessionService(deps);

    await service.exchange(request);

    const expectedSubject = createHmac("sha256", SUBJECT_KEY)
      .update(`${request.app_id}:raw-anonymous-open-id`)
      .digest("hex");
    expect(deps.tokenSigner).toHaveBeenCalledWith(expect.objectContaining({
      subject_hash: expectedSubject,
    }));
  });

  test("rejects installation, deployment, tenant and authorization boundary failures", async () => {
    const cases = [
      [null, request, "DOUYIN_INSTALLATION_MISSING"],
      [merchant, { ...request, deployment_key: "forged" }, "DOUYIN_INSTALLATION_MISSING"],
      [merchant, { ...request, deployment_key: undefined }, "DOUYIN_INSTALLATION_MISSING"],
      [{ ...merchant, authorization_status: "disabled" }, request,
        "DOUYIN_INSTALLATION_DISABLED"],
      [{ ...merchant, authorization_status: "revoked", tenant: null }, request,
        "DOUYIN_AUTHORIZATION_EXPIRED"],
      [{ ...merchant, tenant: { id: TENANT_ID, status: "suspended" } }, request,
        "TENANT_NOT_AVAILABLE"],
      [{ ...merchant, installation_kind: "template_development", deployment_key: null },
        { ...request, deployment_key: undefined }, "DOUYIN_INSTALLATION_MISSING"],
    ] as const;

    for (const [installation, input, code] of cases) {
      const service = new DouyinMiniappSessionService(dependencies(installation));
      await expect(service.exchange(input)).rejects.toMatchObject({ statusCode: 409, code });
    }
  });

  test("rejects missing identities and preserves stable OpenAPI errors", async () => {
    const missingIdentity = dependencies();
    missingIdentity.openPlatform.code2Session = mock(async () => ({
      sessionKey: "raw-session-key",
    })) as never;
    await expect(new DouyinMiniappSessionService(missingIdentity).exchange(request))
      .rejects.toMatchObject({ code: "DOUYIN_SESSION_EXCHANGE_FAILED" });

    const expired = dependencies();
    expired.accessTokens.getAuthorizerAccessToken = mock(async () => {
      throw Errors.business(409, "抖音授权已失效", "DOUYIN_AUTHORIZATION_EXPIRED");
    });
    await expect(new DouyinMiniappSessionService(expired).exchange(request))
      .rejects.toMatchObject({ code: "DOUYIN_AUTHORIZATION_EXPIRED" });
  });

  test("strict request schema rejects forged tenant fields and unbounded attribution", () => {
    expect(DouyinMiniappSessionRequestSchema.safeParse({
      ...request,
      tenant_id: TENANT_ID,
    }).success).toBe(false);
    expect(DouyinMiniappSessionRequestSchema.safeParse({
      ...request,
      launch_context: { ...request.launch_context, source_type: "forged-source" },
    }).success).toBe(false);
    expect(DouyinMiniappSessionRequestSchema.safeParse({
      ...request,
      launch_context: { ...request.launch_context, campaign_code: "x".repeat(65) },
    }).success).toBe(false);
  });
});
