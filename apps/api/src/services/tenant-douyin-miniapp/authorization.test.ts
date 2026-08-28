import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash, createSecretKey } from "node:crypto";
import { DOUYIN_DEFAULT_CONTACT_SLA_TEXT } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type {
  CompleteIntentInput,
  CreateIntentInput,
} from "@/repositories/douyin-miniapp-authorization-intents";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service:
  typeof import("./authorization").TenantDouyinMiniappAuthorizationService;

beforeAll(async () => {
  ({ TenantDouyinMiniappAuthorizationService: Service } = await import(
    "./authorization"
  ));
});

const NOW_MS = Date.parse("2026-07-26T10:00:00.000Z");
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const INTENT_ID = "44444444-4444-4444-8444-444444444444";
const OPAQUE_INTENT = "opaque_intent_0123456789ABCDEFGHijklmnop";
const AUTHORIZATION_CODE = "authorization-code";
const AUTHORIZER_APP_ID = "tt-authorizer";
const CODE_DIGEST = digest(AUTHORIZATION_CODE);
const INTENT_DIGEST = digest(OPAQUE_INTENT);
const EXPIRES_AT = "2026-07-26T10:10:00.000Z";

const runtimeConfig = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" as const },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false as const,
    phone_capture_mode: "sms" as const,
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: "2026-07-19",
  contact_sla_text: DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
};

function tenantContext(tenantId = TENANT_ID): AuthContext {
  return {
    authUserId: "55555555-5555-4555-8555-555555555555",
    employeeId: EMPLOYEE_ID,
    tenantId,
    tenantName: "验收租户",
    tenantSlug: "acceptance-tenant",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["system_admin"],
    roles: [],
    permissions: [
      { code: "douyin_miniapp.manage", scope: "all" },
    ],
  };
}

function intentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    tenantId: TENANT_ID,
    requestedByEmployeeId: EMPLOYEE_ID,
    componentAppId: "component-appid",
    intentDigest: INTENT_DIGEST,
    authorizationCodeDigest: null,
    authorizerAppId: null,
    status: "pending" as const,
    expiresAt: EXPIRES_AT,
    completedAt: null,
    failureCode: null,
    createdAt: "2026-07-26T10:00:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    ...overrides,
  };
}

function createService(options: {
  readonly currentInstallation?: object | null;
  readonly previousInstallation?: object | null;
  readonly claim?: object;
  readonly exchangeError?: Error;
  readonly eventAuthorizerAppId?: string | null;
  readonly correlatedInstallation?: object | null;
  readonly permissionDenied?: boolean;
} = {}) {
  const intents = {
    create: mock(async (_input: CreateIntentInput) => intentRecord()),
    claim: mock(async (_input: {
      readonly intentDigest: string;
      readonly authorizationCodeDigest: string;
    }) => options.claim ?? {
      state: "completing",
      intentId: INTENT_ID,
      tenantId: TENANT_ID,
      componentAppId: "component-appid",
      expiresAt: EXPIRES_AT,
      authorizerAppId: null,
    }),
    complete: mock(async (_input: CompleteIntentInput) =>
      intentRecord({
        status: "completed",
        authorizationCodeDigest: CODE_DIGEST,
        authorizerAppId: AUTHORIZER_APP_ID,
        completedAt: "2026-07-26T10:00:01.000Z",
      })),
    fail: mock(async (_input: {
      readonly intentId: string;
      readonly failureCode: string;
    }) => undefined),
    findAuthorizerByCodeDigest: mock(async (_codeDigest: string) =>
      options.eventAuthorizerAppId ?? null),
  };
  const gateway = {
    generateAuthorizationLink: mock(async () => ({
      link: "https://open.douyin.com/authorize/example",
      logId: "authorization-link-log",
    })),
    exchangeAuthorizationCode: mock(async () => {
      if (options.exchangeError) throw options.exchangeError;
      return {
        accessToken: "authorizer-access-token",
        authorizerAppId: AUTHORIZER_APP_ID,
        refreshToken: "authorizer-refresh-token",
        expiresIn: 7_200,
        refreshExpiresIn: 2_592_000,
        permissions: [{ id: 1 }],
      };
    }),
  };
  const workspace = {
    findCurrentInstallation: mock(async () =>
      options.currentInstallation ?? null),
    findPreviousInstallation: mock(async () =>
      options.previousInstallation ?? null),
  };
  const installations = {
    findActiveByAuthorizerAppId: mock(async () =>
      options.correlatedInstallation ?? null),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw Errors.forbidden();
      return context.tenantId;
    }),
    assertPermission: mock(() => {
      if (options.permissionDenied) throw Errors.forbidden();
      return "all";
    }),
  };
  const accessTokens = {
    getComponentAccessToken: mock(async () => "component-access-token"),
  };
  const service = new Service({
    intents: intents as never,
    workspace: workspace as never,
    installations: installations as never,
    accessPolicy: accessPolicy as never,
    accessTokens: accessTokens as never,
    gateway: gateway as never,
    componentAppId: "component-appid",
    credentialKeyring: {
      activeKeyVersion: "v1",
      keys: { v1: createSecretKey(Buffer.alloc(32, 0x66)) },
    },
    redirectUri: "https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback",
    runtimeConfig,
    now: () => NOW_MS,
    opaqueIntent: () => OPAQUE_INTENT,
    deploymentKey: () => "generated-deployment-key",
    sleep: async () => undefined,
  });
  return {
    service,
    intents,
    gateway,
    workspace,
    installations,
    accessPolicy,
    accessTokens,
  };
}

describe("TenantDouyinMiniappAuthorizationService", () => {
  test("creates a ten-minute digest-only intent and returns the official link", async () => {
    const { service, intents, gateway } = createService();

    await expect(
      service.startAuthorization(tenantContext()),
    ).resolves.toEqual({
      link: "https://open.douyin.com/authorize/example",
      intent_expires_at: EXPIRES_AT,
    });
    expect(intents.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      requestedByEmployeeId: EMPLOYEE_ID,
      componentAppId: "component-appid",
      intentDigest: INTENT_DIGEST,
      expiresAt: EXPIRES_AT,
    });
    expect(intents.create.mock.calls[0]?.[0].intentDigest).not.toBe(
      OPAQUE_INTENT,
    );
    expect(gateway.generateAuthorizationLink).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      redirectUri:
        `https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback?intent=${OPAQUE_INTENT}`,
    });
  });

  test("requires manage permission and rejects an existing active merchant", async () => {
    const denied = createService({ permissionDenied: true });
    await expect(
      denied.service.startAuthorization(tenantContext()),
    ).rejects.toMatchObject({ statusCode: 403 });

    const bound = createService({
      currentInstallation: {
        authorization_status: "active",
        installation_kind: "merchant",
      },
    });
    await expect(
      bound.service.startAuthorization(tenantContext()),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_TENANT_ALREADY_AUTHORIZED",
    });
  });

  test("seals exchanged credentials and completes the tenant binding", async () => {
    const { service, intents } = createService();

    await expect(service.completeAuthorizationCallback(
      tenantContext(),
      {
        intent: OPAQUE_INTENT,
        authorization_code: AUTHORIZATION_CODE,
        expires_in: 7_200,
      },
    )).resolves.toEqual({
      status: "completed",
      authorizer_appid: AUTHORIZER_APP_ID,
    });

    expect(intents.claim).toHaveBeenCalledWith({
      intentDigest: INTENT_DIGEST,
      authorizationCodeDigest: CODE_DIGEST,
    });
    const completed = intents.complete.mock.calls[0]?.[0] as CompleteIntentInput;
    expect(completed).toMatchObject({
      intentId: INTENT_ID,
      authorizationCodeDigest: CODE_DIGEST,
      authorizerAppId: AUTHORIZER_APP_ID,
      deploymentKey: "generated-deployment-key",
      runtimeConfig,
      permissions: [{ id: 1 }],
    });
    const accessToken = completed.accessToken as NonNullable<
      CompleteIntentInput["accessToken"]
    >;
    const refreshToken = completed.refreshToken as NonNullable<
      CompleteIntentInput["refreshToken"]
    >;
    expect(accessToken.ciphertext).not.toContain(
      "authorizer-access-token",
    );
    expect(refreshToken.ciphertext).not.toContain(
      "authorizer-refresh-token",
    );
    expect(accessToken.expiresAt).toBe(
      "2026-07-26T12:00:00.000Z",
    );
  });

  test("preserves the previous tenant runtime config when authorizing a replacement miniapp", async () => {
    const previousRuntimeConfig = {
      ...runtimeConfig,
      brand: {
        logo_url: "https://assets.gooes.cn/douyin/tenant/logo.png",
        qualifications: [],
      },
    };
    const { service, intents, workspace } = createService({
      previousInstallation: {
        authorizer_appid: "previous-authorizer",
        runtime_config: previousRuntimeConfig,
      },
    });

    await service.completeAuthorizationCallback(tenantContext(), {
      intent: OPAQUE_INTENT,
      authorization_code: AUTHORIZATION_CODE,
      expires_in: 7_200,
    });

    expect(workspace.findPreviousInstallation).toHaveBeenCalledWith(
      TENANT_ID,
      AUTHORIZER_APP_ID,
    );
    expect(intents.complete).toHaveBeenCalledWith(expect.objectContaining({
      runtimeConfig: previousRuntimeConfig,
    }));
  });

  test("completes through event correlation when event exchange won the race", async () => {
    const { service, intents, installations } = createService({
      exchangeError: Errors.business(
        502,
        "抖音授权码不可用",
        "DOUYIN_AUTHORIZATION_CODE_INVALID_OR_CONSUMED",
      ),
      eventAuthorizerAppId: AUTHORIZER_APP_ID,
      correlatedInstallation: {
        id: "66666666-6666-4666-8666-666666666666",
        tenant_id: null,
        component_appid: "component-appid",
        authorizer_appid: AUTHORIZER_APP_ID,
        installation_kind: "merchant",
        authorization_status: "authorized_unbound",
      },
    });

    await expect(service.completeAuthorizationCallback(
      tenantContext(),
      {
        intent: OPAQUE_INTENT,
        authorization_code: AUTHORIZATION_CODE,
        expires_in: 7_200,
      },
    )).resolves.toMatchObject({ status: "completed" });

    expect(
      installations.findActiveByAuthorizerAppId,
    ).toHaveBeenCalledWith(AUTHORIZER_APP_ID);
    expect(intents.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizerAppId: AUTHORIZER_APP_ID,
        accessToken: null,
        refreshToken: null,
        permissions: null,
      }),
    );
  });

  test("returns a completed duplicate without exchanging or writing again", async () => {
    const { service, intents, gateway } = createService({
      claim: {
        state: "completed",
        intentId: INTENT_ID,
        tenantId: TENANT_ID,
        componentAppId: "component-appid",
        expiresAt: EXPIRES_AT,
        authorizerAppId: AUTHORIZER_APP_ID,
      },
    });

    await expect(service.completeAuthorizationCallback(
      tenantContext(),
      {
        intent: OPAQUE_INTENT,
        authorization_code: AUTHORIZATION_CODE,
        expires_in: 7_200,
      },
    )).resolves.toEqual({
      status: "completed",
      authorizer_appid: AUTHORIZER_APP_ID,
    });
    expect(gateway.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(intents.complete).not.toHaveBeenCalled();
  });

  test("rejects an intent claimed by another tenant", async () => {
    const { service } = createService({
      claim: {
        state: "completing",
        intentId: INTENT_ID,
        tenantId: OTHER_TENANT_ID,
        componentAppId: "component-appid",
        expiresAt: EXPIRES_AT,
        authorizerAppId: null,
      },
    });

    await expect(service.completeAuthorizationCallback(
      tenantContext(),
      {
        intent: OPAQUE_INTENT,
        authorization_code: AUTHORIZATION_CODE,
        expires_in: 7_200,
      },
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  test("marks a claimed intent failed after a non-race exchange error", async () => {
    const upstreamError = Errors.business(
      502,
      "抖音开放平台请求失败",
      "DOUYIN_OPEN_PLATFORM_API_ERROR",
    );
    const { service, intents } = createService({
      exchangeError: upstreamError,
    });

    await expect(service.completeAuthorizationCallback(
      tenantContext(),
      {
        intent: OPAQUE_INTENT,
        authorization_code: AUTHORIZATION_CODE,
        expires_in: 7_200,
      },
    )).rejects.toBe(upstreamError);
    expect(intents.fail).toHaveBeenCalledWith({
      intentId: INTENT_ID,
      failureCode: "DOUYIN_AUTHORIZATION_EXCHANGE_FAILED",
    });
  });
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
