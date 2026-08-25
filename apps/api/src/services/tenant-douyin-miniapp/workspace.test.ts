import { beforeAll, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service:
  typeof import("./workspace").TenantDouyinMiniappWorkspaceService;

beforeAll(async () => {
  ({ TenantDouyinMiniappWorkspaceService: Service } = await import(
    "./workspace"
  ));
});

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

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
};

const tenant = { id: TENANT_ID, name: "后台租户名称" };
const profile = {
  public_name: "抖音公开品牌名",
  introduction: "公开简介",
  public_phone: "13912349000",
  status: "published" as const,
  version: 2,
  submitted_at: "2026-07-20T00:00:00+00:00",
  reviewed_at: "2026-07-20T01:00:00+00:00",
  review_remark: null,
  published_at: "2026-07-20T01:00:00+00:00",
  updated_at: "2026-07-20T01:00:00+00:00",
};
const installation = {
  id: INSTALLATION_ID,
  authorizer_appid: "tt-authorizer",
  installation_kind: "merchant" as const,
  authorization_status: "active" as const,
  permission_snapshot: [],
  runtime_config: runtimeConfig,
  template_version: "0.1.2",
  template_release_id: null,
  created_at: "2026-07-20T00:00:00+00:00",
  updated_at: "2026-07-20T01:00:00+00:00",
};
const counts = { cases: 3, sites: 2, active_service_areas: 1 };
const deployableTemplate = {
  id: "55555555-5555-4555-8555-555555555555",
  template_app_id: "tt0d647bd99301341b01",
  source_draft_id: "1024",
  template_id: "77596",
  template_version: "0.1.4",
  description: "租户发布闭环",
  channel: "default" as const,
  is_current: true,
  confirmed_by_employee_id: "66666666-6666-4666-8666-666666666666",
  confirmed_at: "2026-08-13T08:00:00.000Z",
  created_at: "2026-08-13T08:00:00.000Z",
};
const tenantRelease = {
  id: "77777777-7777-4777-8777-777777777777",
  installation_id: INSTALLATION_ID,
  template_id: deployableTemplate.template_id,
  template_version: deployableTemplate.template_version,
  description: deployableTemplate.description,
  status: "testing" as const,
  test_qr_url: "https://example.test/test-qr.png",
  latest_test_qr_url: "https://example.test/test-qr.png",
  audit_qr_url: null,
  audit_note: null,
  audit_result: null,
  submitted_at: null,
  audited_at: null,
  released_at: null,
  created_at: "2026-08-13T08:00:00.000Z",
  updated_at: "2026-08-13T08:00:00.000Z",
};

function tenantContext(): AuthContext {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    employeeId: "44444444-4444-4444-8444-444444444444",
    tenantId: TENANT_ID,
    tenantName: tenant.name,
    tenantSlug: "tenant-a",
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
      { code: "douyin_miniapp.read", scope: "all" },
    ],
  };
}

function createService(input: {
  permissionScope?: "all" | null;
  currentTenant?: typeof tenant | null;
  currentProfile?: typeof profile | null;
  currentInstallation?: typeof installation | null;
  currentCounts?: typeof counts;
  latestRelease?: (Omit<typeof tenantRelease, "status"> & {
    status: "testing" | "released" | "audit_rejected";
  }) | null;
  currentTemplate?: typeof deployableTemplate | null;
} = {}) {
  const repository = {
    findTenantSummary: mock(
      async () => input.currentTenant === undefined
        ? tenant
        : input.currentTenant,
    ),
    findProfile: mock(
      async () => input.currentProfile === undefined
        ? profile
        : input.currentProfile,
    ),
    findCurrentInstallation: mock(
      async () => input.currentInstallation === undefined
        ? installation
        : input.currentInstallation,
    ),
    getPublicContentCounts: mock(async () => input.currentCounts ?? counts),
    findLatestRelease: mock(async () => input.latestRelease ?? null),
  };
  const templates = {
    findCurrent: mock(async () => input.currentTemplate === undefined
      ? deployableTemplate
      : input.currentTemplate),
  };
  const accessPolicy = {
    assertTenantContext: mock((authContext: AuthContext) => {
      if (!authContext.tenantId) throw Errors.forbidden();
      return authContext.tenantId;
    }),
    assertPermission: mock(() => {
      if (input.permissionScope === null) throw Errors.forbidden();
      return input.permissionScope ?? "all";
    }),
  };
  return {
    service: new Service({
      repository: repository as never,
      templates: templates as never,
      accessPolicy: accessPolicy as never,
    }),
    repository,
    templates,
    accessPolicy,
  };
}

describe("TenantDouyinMiniappWorkspaceService", () => {
  test("requires tenant workspace read permission", async () => {
    const { service } = createService({ permissionScope: null });
    await expect(service.getWorkspace(tenantContext())).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("uses the authenticated tenant and returns no secret fields", async () => {
    const { service, repository } = createService();

    const result = await service.getWorkspace(tenantContext());

    expect(repository.findCurrentInstallation).toHaveBeenCalledWith(TENANT_ID);
    expect(repository.findTenantSummary).toHaveBeenCalledWith(TENANT_ID);
    expect(JSON.stringify(result)).not.toMatch(
      /deployment_key|access_token|refresh_token|component_app_secret/,
    );
  });

  test("returns an explicit unbound workspace", async () => {
    const { service, repository } = createService({
      currentInstallation: null,
    });

    await expect(service.getWorkspace(tenantContext())).resolves.toMatchObject({
      authorization_state: "unbound",
      installation: null,
      latest_release: null,
      release_state: "not_uploaded",
    });
    expect(repository.findLatestRelease).not.toHaveBeenCalled();
  });

  test("keeps internal tenant identity and public miniapp identity distinct", async () => {
    const { service } = createService();

    await expect(service.getWorkspace(tenantContext())).resolves.toMatchObject({
      tenant,
      public_profile: { public_name: "抖音公开品牌名" },
      public_content: counts,
    });
  });

  test("fails closed when the authenticated tenant no longer exists", async () => {
    const { service } = createService({ currentTenant: null });

    await expect(service.getWorkspace(tenantContext())).rejects.toMatchObject({
      statusCode: 404,
      code: "DOUYIN_TENANT_NOT_FOUND",
    });
  });

  test("derives new, in-progress and up-to-date availability by template version", async () => {
    const available = createService();
    await expect(available.service.getWorkspace(tenantContext()))
      .resolves.toMatchObject({
        available_template: {
          template_id: deployableTemplate.template_id,
          state: "new_available",
        },
      });

    const inProgress = createService({ latestRelease: tenantRelease });
    await expect(inProgress.service.getWorkspace(tenantContext()))
      .resolves.toMatchObject({
        available_template: {
          template_id: deployableTemplate.template_id,
          state: "in_progress",
        },
      });

    const upToDate = createService({
      latestRelease: { ...tenantRelease, status: "released" },
    });
    await expect(upToDate.service.getWorkspace(tenantContext()))
      .resolves.toMatchObject({
        available_template: {
          template_id: deployableTemplate.template_id,
          state: "up_to_date",
        },
      });
  });

  test("does not expose a rolled-back current template as a new version", async () => {
    const rolledBackTemplate = {
      ...deployableTemplate,
      template_id: "78149",
      template_version: "0.1.2",
      description: "旧模板误设为当前",
    };
    const rejectedNewerRelease = {
      ...tenantRelease,
      template_id: "77595",
      template_version: "0.1.3",
      description: "较新的审核记录",
      status: "audit_rejected" as const,
    };
    const { service } = createService({
      currentTemplate: rolledBackTemplate,
      latestRelease: rejectedNewerRelease,
    });

    await expect(service.getWorkspace(tenantContext()))
      .resolves.toMatchObject({
        available_template: {
          template_id: "78149",
          version: "0.1.2",
          state: "stale_version",
        },
      });
  });

  test("does not expose a template prompt before platform confirmation", async () => {
    const { service } = createService({ currentTemplate: null });
    await expect(service.getWorkspace(tenantContext())).resolves.toMatchObject({
      available_template: null,
    });
  });
});
