import { beforeAll, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

let Service:
  typeof import("./lead-capture-config").TenantDouyinMiniappLeadCaptureConfigService;

beforeAll(async () => {
  ({ TenantDouyinMiniappLeadCaptureConfigService: Service } = await import(
    "./lead-capture-config"
  ));
});

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const APP_ID = "ttd033a68e4e56ccd301";
const COMPONENT_ID = "5785490b6443ad9def6f88e69c57920c";
const UPDATED_AT = "2026-09-06T00:00:00.000Z";
const input = {
  authorizer_appid: APP_ID,
  enabled: true,
  clue_component_id: COMPONENT_ID,
  expected_updated_at: UPDATED_AT,
};
const installation = {
  id: INSTALLATION_ID,
  authorizer_appid: APP_ID,
  authorization_status: "active" as const,
};

function authContext(): AuthContext {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    employeeId: "44444444-4444-4444-8444-444444444444",
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test-tenant",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "租户管理员",
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
    permissions: [],
  };
}

function createService(options: {
  permission?: boolean;
  current?: typeof installation | null;
} = {}) {
  const repository = { update: mock(async () => ({
    installation_id: INSTALLATION_ID,
    authorizer_appid: APP_ID,
    enabled: true,
    clue_component_id: COMPONENT_ID,
    updated_at: "2026-09-06T00:00:01.000Z",
  })) };
  const workspace = { findCurrentInstallation: mock(async () =>
    options.current === undefined ? installation : options.current) };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock(() => {
      if (options.permission === false) throw Errors.forbidden();
      return "all" as const;
    }),
  };
  return {
    service: new Service({ repository, workspace, accessPolicy } as never),
    repository,
    workspace,
    accessPolicy,
  };
}

describe("TenantDouyinMiniappLeadCaptureConfigService", () => {
  test("requires tenant manage permission before database writes", async () => {
    const { service, repository } = createService({ permission: false });
    await expect(service.update(authContext(), input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  test("binds the update to the current active tenant AppID", async () => {
    const { service, repository, accessPolicy } = createService();
    await service.update(authContext(), input);
    expect(accessPolicy.assertPermission).toHaveBeenCalledWith(
      authContext(),
      "douyin_miniapp.manage",
    );
    expect(repository.update).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
      authorizerAppId: APP_ID,
      expectedUpdatedAt: UPDATED_AT,
      enabled: true,
      clueComponentId: COMPONENT_ID,
    });
  });

  test("rejects missing, inactive or mismatched current installations", async () => {
    for (const current of [
      null,
      { ...installation, authorization_status: "disabled" as const },
      { ...installation, authorizer_appid: "tt-other" },
    ]) {
      const { service, repository } = createService({ current: current as never });
      await expect(service.update(authContext(), input)).rejects.toMatchObject({
        statusCode: current === null ? 404 : 409,
      });
      expect(repository.update).not.toHaveBeenCalled();
    }
  });
});
