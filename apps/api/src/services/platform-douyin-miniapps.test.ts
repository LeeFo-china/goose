import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { PlatformDouyinMiniappSafeRecord } from "@/schema/platform-douyin-miniapps";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let PlatformDouyinMiniappsService:
  typeof import("./platform-douyin-miniapps").PlatformDouyinMiniappsService;

beforeAll(async () => {
  ({ PlatformDouyinMiniappsService } = await import("./platform-douyin-miniapps"));
});

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

const runtimeConfig = {
  brand: {
    logo_url: "https://cdn.example.com/logo.png",
    qualifications: [{ title: "建筑装修装饰工程", image_url: null }],
  },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" as const },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false as const,
    phone_capture_mode: "sms" as const,
  },
  home_banners: [],
  trust_metrics: [{ label: "服务客户", value: "1200+" }],
  privacy_policy_version: "2026-07-19",
};

const installation: PlatformDouyinMiniappSafeRecord = {
  id: INSTALLATION_ID,
  tenant_id: TENANT_ID,
  component_appid: "component-appid",
  authorizer_appid: "merchant-appid",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: ["lead.create"],
  runtime_config: runtimeConfig,
  template_id: null,
  template_version: null,
  last_submitted_at: null,
  last_audited_at: null,
  last_released_at: null,
  revoked_at: null,
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  tenant: { id: TENANT_ID, name: "示例装饰", slug: "demo", status: "active" },
};

const authContext: AuthContext = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  employeeId: "55555555-5555-4555-8555-555555555555",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.douyin_miniapp.manage", scope: "all" }],
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    list: mock(async (_query: unknown) => ({ list: [installation], total: 1 })),
    findById: mock(async (_id: string) => installation),
    findByAuthorizerAppId: mock(async (_appId: string) => ({
      ...installation,
      authorizer_appid: "template-appid",
      installation_kind: "template_development" as const,
    })),
    findTenantStatusById: mock(async (id: string) => ({ id, status: "active" })),
    createTemplateDevelopmentAtomically: mock(async (_input: unknown) => ({ ...installation,
      authorizer_appid: "template-appid", installation_kind: "template_development",
    })),
    updateRuntimeConfig: mock(async (_id: string, _config: unknown) => installation),
    rotateDeploymentKey: mock(async (_id: string, _key: string) => installation),
    disable: mock(async (_id: string) => ({
      ...installation, authorization_status: "disabled" as const,
    })),
    enableAtomically: mock(async (_id: string) => installation),
    ...overrides,
  };
  const bindingRepository = {
    bindActiveTenant: mock(async (_input: unknown) => ({ id: INSTALLATION_ID })),
  };
  const accessPolicy = {
    assertPermission: mock((_context: AuthContext, _permission: string) => "all" as const),
  };
  return { repository, bindingRepository, accessPolicy };
}

describe("PlatformDouyinMiniappsService", () => {
  test("enforces platform.douyin_miniapp.manage on every operation", async () => {
    const deps = dependencies();
    const service = new PlatformDouyinMiniappsService(deps as never);

    await Promise.allSettled([
      service.list(authContext, { page: 1, pageSize: 20 }),
      service.getTemplateSource(authContext),
      service.get(authContext, INSTALLATION_ID),
      service.bind(authContext, INSTALLATION_ID, {
        tenant_id: TENANT_ID,
        runtime_config: runtimeConfig,
      }),
      service.createTemplateDevelopment(authContext, {
        tenant_id: TENANT_ID,
        runtime_config: runtimeConfig,
      }),
      service.updateConfig(authContext, INSTALLATION_ID, { runtime_config: runtimeConfig }),
      service.rotateDeploymentKey(authContext, INSTALLATION_ID),
      service.disable(authContext, INSTALLATION_ID),
      service.enable(authContext, INSTALLATION_ID),
    ]);

    expect(deps.accessPolicy.assertPermission).toHaveBeenCalledTimes(9);
    for (const call of deps.accessPolicy.assertPermission.mock.calls) {
      expect(call).toEqual([authContext, "platform.douyin_miniapp.manage"]);
    }
  });

  test("does not grant tenant users platform management even if a permission is misassigned", async () => {
    const deps = dependencies();
    const service = new PlatformDouyinMiniappsService(deps as never);

    await expect(service.list(
      { ...authContext, isPlatformAdmin: false },
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.repository.list).not.toHaveBeenCalled();
  });

  test("requires the all scope for platform installation management", async () => {
    const deps = dependencies();
    deps.accessPolicy.assertPermission = mock(() => "tenant" as never);
    const service = new PlatformDouyinMiniappsService(deps as never);

    await expect(service.list(authContext, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.repository.list).not.toHaveBeenCalled();
  });

  test("uses bounded range pagination and strips all credential and deployment fields", async () => {
    const unsafe = {
      ...installation,
      deployment_key: "must-not-leak",
      access_token_ciphertext: "must-not-leak",
      refresh_token_ciphertext: "must-not-leak",
      token_refresh_claim_token: "must-not-leak",
    };
    const deps = dependencies({
      list: mock(async () => ({ list: [unsafe], total: 151 })),
    });
    const service = new PlatformDouyinMiniappsService(deps as never);

    const result = await service.list(authContext, { page: 2, pageSize: 100 });

    expect(deps.repository.list).toHaveBeenCalledWith({ page: 2, pageSize: 100 });
    expect(result.pagination).toEqual({ page: 2, pageSize: 100, total: 151, totalPages: 2 });
    expect(JSON.stringify(result)).not.toMatch(/deployment_key|ciphertext|refresh_claim|must-not-leak/);
  });

  test("resolves the template source from server configuration", async () => {
    const template = {
      ...installation,
      authorizer_appid: "tt0d647bd99301341b01",
      installation_kind: "template_development" as const,
    };
    const deps = dependencies({
      findByAuthorizerAppId: mock(async () => template),
    });
    const service = new PlatformDouyinMiniappsService({
      ...deps,
      configProvider: () => ({
        componentAppId: "component-appid",
        templateAppId: template.authorizer_appid,
      }),
    } as never);

    await expect(service.getTemplateSource(authContext)).resolves.toEqual({
      template_app_id: template.authorizer_appid,
      installation: template,
    });
    expect(deps.repository.findByAuthorizerAppId).toHaveBeenCalledWith(
      template.authorizer_appid,
    );
  });

  test("bind validates an active tenant and only binds authorized_unbound merchant once", async () => {
    const unbound = { ...installation, tenant_id: null, tenant: null,
      authorization_status: "authorized_unbound" as const };
    const deps = dependencies({ findById: mock(async () => unbound) });
    const service = new PlatformDouyinMiniappsService(deps as never);

    await service.bind(authContext, INSTALLATION_ID, {
      tenant_id: TENANT_ID,
      runtime_config: runtimeConfig,
    });

    expect(deps.repository.findTenantStatusById).toHaveBeenCalledWith(TENANT_ID);
    expect(deps.bindingRepository.bindActiveTenant).toHaveBeenCalledTimes(1);
    const input = deps.bindingRepository.bindActiveTenant.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(input).toMatchObject({
      authorizerAppId: "merchant-appid",
      tenantId: TENANT_ID,
      runtimeConfig,
    });
    expect(Buffer.from(String(input.deploymentKey), "base64url").byteLength).toBe(32);
  });

  test("rejects missing or inactive tenants before installation writes", async () => {
    for (const tenant of [null, { id: TENANT_ID, status: "suspended" }]) {
      const unbound = { ...installation, tenant_id: null, tenant: null,
        authorization_status: "authorized_unbound" as const };
      const deps = dependencies({
        findById: mock(async () => unbound),
        findTenantStatusById: mock(async () => tenant),
      });
      const service = new PlatformDouyinMiniappsService(deps as never);

      await expect(service.bind(authContext, INSTALLATION_ID, {
        tenant_id: TENANT_ID, runtime_config: runtimeConfig,
      })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_TENANT_NOT_ACTIVE" });
      expect(deps.bindingRepository.bindActiveTenant).not.toHaveBeenCalled();
    }
  });

  test("creates one credential-free template development installation idempotently", async () => {
    const deps = dependencies();
    const service = new PlatformDouyinMiniappsService({
      ...deps,
      configProvider: () => ({ componentAppId: "component-appid", templateAppId: "template-appid" }),
    } as never);

    await service.createTemplateDevelopment(authContext, {
      tenant_id: TENANT_ID, runtime_config: runtimeConfig,
    });

    expect(deps.repository.createTemplateDevelopmentAtomically).toHaveBeenCalledWith({
      componentAppId: "component-appid",
      authorizerAppId: "template-appid",
      tenantId: TENANT_ID,
      runtimeConfig,
    });
    expect(JSON.stringify(
      deps.repository.createTemplateDevelopmentAtomically.mock.calls[0]?.[0],
    ))
      .not.toMatch(/deployment|token|secret|credential/i);
  });

  test("propagates the atomic template conflict for another tenant", async () => {
    const deps = dependencies({
      createTemplateDevelopmentAtomically: mock(async () => {
        throw Object.assign(new Error("conflict"), {
          statusCode: 409, code: "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT",
        });
      }),
    });
    const service = new PlatformDouyinMiniappsService({
      ...deps,
      configProvider: () => ({ componentAppId: "component-appid", templateAppId: "template-appid" }),
    } as never);

    await expect(service.createTemplateDevelopment(authContext, {
      tenant_id: TENANT_ID, runtime_config: runtimeConfig,
    })).rejects.toMatchObject({
      statusCode: 409, code: "DOUYIN_TEMPLATE_INSTALLATION_CONFLICT",
    });
  });

  test("returns the atomic RPC result for a concurrent same-tenant template create", async () => {
    const existingTemplate = {
      ...installation,
      authorizer_appid: "template-appid",
      installation_kind: "template_development" as const,
    };
    const deps = dependencies({
      createTemplateDevelopmentAtomically: mock(async () => existingTemplate),
    });
    const service = new PlatformDouyinMiniappsService({
      ...deps,
      configProvider: () => ({ componentAppId: "component-appid", templateAppId: "template-appid" }),
    } as never);

    await expect(service.createTemplateDevelopment(authContext, {
      tenant_id: TENANT_ID,
      runtime_config: runtimeConfig,
    })).resolves.toEqual(existingTemplate);
    expect(deps.repository.createTemplateDevelopmentAtomically).toHaveBeenCalledTimes(1);
  });

  test("deployment key rotation uses a fresh 256-bit value and never returns it", async () => {
    const rotatedKeys: string[] = [];
    const deps = dependencies({
      rotateDeploymentKey: mock(async (_id: string, key: string) => {
        rotatedKeys.push(key);
        return installation;
      }),
    });
    const service = new PlatformDouyinMiniappsService(deps as never);

    const first = await service.rotateDeploymentKey(authContext, INSTALLATION_ID);
    const second = await service.rotateDeploymentKey(authContext, INSTALLATION_ID);

    expect(rotatedKeys).toHaveLength(2);
    expect(rotatedKeys[0]).not.toBe(rotatedKeys[1]);
    expect(Buffer.from(rotatedKeys[0]!, "base64url")).toHaveLength(32);
    expect(JSON.stringify([first, second])).not.toContain(rotatedKeys[0]!);
    expect(JSON.stringify(first)).not.toContain("deployment_key");
  });

  test("rejects padded, malformed and undersized deployment keys before repository writes", async () => {
    for (const deploymentKey of [
      "AAAAAAAAAAAAAAAAAAAAAA==",
      "AAAAAAAAAAAAAAAAAAAAA!",
      "AAAAAAAAAAAAAAAA",
      Buffer.alloc(16).toString("base64url"),
      Buffer.alloc(31).toString("base64url"),
    ]) {
      const deps = dependencies();
      const service = new PlatformDouyinMiniappsService({
        ...deps,
        deploymentKeyGenerator: () => deploymentKey,
      } as never);

      await expect(service.rotateDeploymentKey(authContext, INSTALLATION_ID))
        .rejects.toMatchObject({
          statusCode: 500,
          code: "DOUYIN_DEPLOYMENT_KEY_GENERATION_FAILED",
        });
      expect(deps.repository.rotateDeploymentKey).not.toHaveBeenCalled();
    }
  });

  test("enforces legal config, rotate, disable and enable states", async () => {
    const cases = [
      ["updateConfig", { ...installation, authorization_status: "revoked" }],
      ["rotateDeploymentKey", { ...installation, authorization_status: "disabled" }],
      ["disable", { ...installation, authorization_status: "disabled" }],
      ["enable", { ...installation, authorization_status: "active" }],
    ] as const;

    for (const [method, record] of cases) {
      const deps = dependencies({ findById: mock(async () => record) });
      const service = new PlatformDouyinMiniappsService(deps as never);
      const action = method === "updateConfig"
        ? service.updateConfig(authContext, INSTALLATION_ID, { runtime_config: runtimeConfig })
        : service[method](authContext, INSTALLATION_ID);
      await expect(action).rejects.toMatchObject({
        statusCode: 409,
        code: "DOUYIN_INSTALLATION_STATE_CONFLICT",
      });
    }
  });
});
