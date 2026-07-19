import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { PlatformDouyinMiniappsService } from "./platform-douyin-miniapps";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENANT_ID = "44444444-4444-4444-8444-444444444444";
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

const installation = {
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
    listForPlatform: mock(async () => ({ list: [installation], total: 1 })),
    findForPlatformById: mock(async () => installation),
    findForPlatformByAuthorizerAppId: mock(async () => null),
    bindActiveTenant: mock(async () => ({ id: INSTALLATION_ID })),
    createTemplateDevelopment: mock(async () => ({ ...installation,
      authorizer_appid: "template-appid", installation_kind: "template_development",
    })),
    updateRuntimeConfig: mock(async () => installation),
    rotateDeploymentKey: mock(async () => installation),
    transitionAuthorizationStatus: mock(async () => installation),
    ...overrides,
  };
  const tenantRepository = {
    findById: mock(async (id: string) => ({ id, status: "active", name: "示例装饰" })),
  };
  const accessPolicy = { assertPermission: mock(() => "all" as const) };
  return { repository, tenantRepository, accessPolicy };
}

describe("PlatformDouyinMiniappsService", () => {
  test("enforces platform.douyin_miniapp.manage on every operation", async () => {
    const deps = dependencies();
    const service = new PlatformDouyinMiniappsService(deps as never);

    await service.list(authContext, { page: 1, pageSize: 20 });
    await service.get(authContext, INSTALLATION_ID);
    await service.bind(authContext, INSTALLATION_ID, { tenant_id: TENANT_ID, runtime_config: runtimeConfig });
    await service.createTemplateDevelopment(authContext, { tenant_id: TENANT_ID, runtime_config: runtimeConfig });
    await service.updateConfig(authContext, INSTALLATION_ID, { runtime_config: runtimeConfig });
    await service.rotateDeploymentKey(authContext, INSTALLATION_ID);
    await service.disable(authContext, INSTALLATION_ID);
    await service.enable(authContext, INSTALLATION_ID);

    expect(deps.accessPolicy.assertPermission).toHaveBeenCalledTimes(8);
    for (const call of deps.accessPolicy.assertPermission.mock.calls) {
      expect(call).toEqual([authContext, "platform.douyin_miniapp.manage"]);
    }
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
      listForPlatform: mock(async () => ({ list: [unsafe], total: 151 })),
    });
    const service = new PlatformDouyinMiniappsService(deps as never);

    const result = await service.list(authContext, { page: 2, pageSize: 100 });

    expect(deps.repository.listForPlatform).toHaveBeenCalledWith({ page: 2, pageSize: 100 });
    expect(result.pagination).toEqual({ page: 2, pageSize: 100, total: 151, totalPages: 2 });
    expect(JSON.stringify(result)).not.toMatch(/deployment_key|ciphertext|refresh_claim|must-not-leak/);
  });

  test("bind validates an active tenant and only binds authorized_unbound merchant once", async () => {
    const unbound = { ...installation, tenant_id: null, tenant: null,
      authorization_status: "authorized_unbound" as const };
    const deps = dependencies({ findForPlatformById: mock(async () => unbound) });
    const service = new PlatformDouyinMiniappsService(deps as never);

    await service.bind(authContext, INSTALLATION_ID, {
      tenant_id: TENANT_ID,
      runtime_config: runtimeConfig,
    });

    expect(deps.tenantRepository.findById).toHaveBeenCalledWith(TENANT_ID);
    expect(deps.repository.bindActiveTenant).toHaveBeenCalledTimes(1);
    const input = deps.repository.bindActiveTenant.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      authorizerAppId: "merchant-appid",
      tenantId: TENANT_ID,
      runtimeConfig,
    });
    expect(Buffer.from(String(input.deploymentKey), "base64url").byteLength).toBeGreaterThanOrEqual(16);
  });

  test("rejects missing or inactive tenants before installation writes", async () => {
    for (const tenant of [null, { id: TENANT_ID, status: "suspended" }]) {
      const unbound = { ...installation, tenant_id: null, tenant: null,
        authorization_status: "authorized_unbound" as const };
      const deps = dependencies({ findForPlatformById: mock(async () => unbound) });
      deps.tenantRepository.findById = mock(async () => tenant) as never;
      const service = new PlatformDouyinMiniappsService(deps as never);

      await expect(service.bind(authContext, INSTALLATION_ID, {
        tenant_id: TENANT_ID, runtime_config: runtimeConfig,
      })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_TENANT_NOT_ACTIVE" });
      expect(deps.repository.bindActiveTenant).not.toHaveBeenCalled();
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

    expect(deps.repository.createTemplateDevelopment).toHaveBeenCalledWith({
      componentAppId: "component-appid",
      authorizerAppId: "template-appid",
      tenantId: TENANT_ID,
      runtimeConfig,
    });
    expect(JSON.stringify(deps.repository.createTemplateDevelopment.mock.calls[0]?.[0]))
      .not.toMatch(/deployment|token|secret|credential/i);

    deps.repository.findForPlatformByAuthorizerAppId = mock(async () => ({
      ...installation,
      authorizer_appid: "template-appid",
      installation_kind: "template_development" as const,
    })) as never;
    await service.createTemplateDevelopment(authContext, {
      tenant_id: TENANT_ID, runtime_config: runtimeConfig,
    });
    expect(deps.repository.createTemplateDevelopment).toHaveBeenCalledTimes(1);
  });

  test("rejects assigning the configured template AppID to another tenant", async () => {
    const deps = dependencies({
      findForPlatformByAuthorizerAppId: mock(async () => ({
        ...installation,
        tenant_id: OTHER_TENANT_ID,
        authorizer_appid: "template-appid",
        installation_kind: "template_development" as const,
      })),
    });
    const service = new PlatformDouyinMiniappsService({
      ...deps,
      configProvider: () => ({ componentAppId: "component-appid", templateAppId: "template-appid" }),
    } as never);

    await expect(service.createTemplateDevelopment(authContext, {
      tenant_id: TENANT_ID, runtime_config: runtimeConfig,
    })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_TEMPLATE_INSTALLATION_TENANT_CONFLICT" });
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

  test("enforces legal config, rotate, disable and enable states", async () => {
    const cases = [
      ["updateConfig", { ...installation, authorization_status: "revoked" }],
      ["rotateDeploymentKey", { ...installation, authorization_status: "disabled" }],
      ["disable", { ...installation, authorization_status: "disabled" }],
      ["enable", { ...installation, authorization_status: "active" }],
    ] as const;

    for (const [method, record] of cases) {
      const deps = dependencies({ findForPlatformById: mock(async () => record) });
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
