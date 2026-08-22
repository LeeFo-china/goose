import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service:
  typeof import("./releases").TenantDouyinMiniappReleasesService;

beforeAll(async () => {
  ({ TenantDouyinMiniappReleasesService: Service } = await import(
    "./releases"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_INSTALLATION_ID = "44444444-4444-4444-8444-444444444444";
const RELEASE_ID = "55555555-5555-4555-8555-555555555555";
const deployableTemplate = {
  template_id: "77596",
  template_version: "0.1.4",
  description: "租户发布闭环",
  channel: "default" as const,
};
const readyReadiness: DouyinReleaseReadiness = {
  ready: true,
  checked_at: "2026-08-20T10:00:00.000Z",
  tenant: { id: TENANT_ID, name: "验收租户" },
  blockers: [],
  warnings: [],
  metrics: {},
};
const blockedReadiness: DouyinReleaseReadiness = {
  ...readyReadiness,
  ready: false,
  blockers: [{
    severity: "blocker" as const,
    code: "BUDGET_PRICING_MISSING" as const,
    message: "预算报价未启用",
    details: {},
  }],
};

function tenantContext(
  permissions: string[] = [
    "douyin_miniapp.read",
    "douyin_miniapp.manage",
    "douyin_miniapp.audit.submit",
    "douyin_miniapp.publish",
  ],
): AuthContext {
  return {
    authUserId: "66666666-6666-4666-8666-666666666666",
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tenantName: "验收租户",
    tenantSlug: "acceptance",
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
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  };
}

function release(overrides: Record<string, unknown> = {}) {
  return {
    id: RELEASE_ID,
    installation_id: INSTALLATION_ID,
    template_id: "77595",
    template_version: "0.1.2",
    description: "租户联调版本",
    channel: "default" as const,
    ext_json: {
      extEnable: true as const,
      extAppid: "tt-authorizer",
      ext: { deployment_key: "secret-deployment-key" },
    },
    status: "testing" as const,
    douyin_log_id: "provider-log",
    test_qr_url: "https://example.test/test-qr.png",
    audit_host_names: [],
    audit_note: null,
    audit_result: null,
    submitted_at: null,
    audited_at: null,
    released_at: null,
    platform_operator_id: EMPLOYEE_ID,
    created_at: "2026-07-26T10:00:00.000Z",
    updated_at: "2026-07-26T10:00:00.000Z",
    ...overrides,
  };
}

function fixture(options: {
  readonly currentInstallation?: object | null;
  readonly target?: object | null;
  readonly profile?: object | null;
  readonly foundRelease?: object | null;
  readonly latestRelease?: object | null;
} = {}) {
  const currentInstallation = options.currentInstallation ?? {
    id: INSTALLATION_ID,
    authorizer_appid: "tt-authorizer",
    installation_kind: "merchant",
    authorization_status: "active",
  };
  const target = options.target ?? {
    id: INSTALLATION_ID,
    authorizer_appid: "tt-authorizer",
    deployment_key: "secret-deployment-key",
    installation_kind: "merchant",
    authorization_status: "active",
    permission_snapshot: [{ id: 1 }],
  };
  const workspace = {
    findCurrentInstallation: mock(async (_tenantId: string) =>
      currentInstallation),
    findProfile: mock(async (_tenantId: string) =>
      options.profile ?? { status: "published" }),
    findLatestRelease: mock(async (_installationId: string) =>
      options.latestRelease === undefined
        ? null
        : options.latestRelease),
  };
  const installations = {
    findReleaseTargetById: mock(async (_id: string) => target),
  };
  const releases = {
    listByInstallation: mock(async (_input: unknown) => ({
      list: [release()],
      total: 1,
    })),
    findById: mock(async (_id: string) =>
      options.foundRelease === undefined
        ? release()
        : options.foundRelease),
  };
  const templates = {
    findCurrent: mock(async (): Promise<typeof deployableTemplate | null> =>
      deployableTemplate),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw new TypeError("missing tenant");
      return context.tenantId;
    }),
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw new TypeError("missing permission");
      }
      return "all";
    }),
  };
  const operations = {
    upload: mock(async () => release({
      id: "77777777-7777-4777-8777-777777777777",
      template_id: deployableTemplate.template_id,
      template_version: deployableTemplate.template_version,
      description: deployableTemplate.description,
      status: "uploaded",
    })),
    getTestQr: mock(async () => release()),
    submitAudit: mock(async () => release({ status: "audit_pending" })),
    syncStatus: mock(async () => release({ status: "audit_approved" })),
    publish: mock(async () => release({ status: "released" })),
  };
  const readiness = {
    evaluateTenant: mock(async () => readyReadiness),
  };
  const service = new Service({
    workspace: workspace as never,
    installations: installations as never,
    releases: releases as never,
    accessPolicy: accessPolicy as never,
    operations: operations as never,
    templates: templates as never,
    readiness: readiness as never,
  });
  return {
    service,
    workspace,
    installations,
    releases,
    accessPolicy,
    operations,
    templates,
    readiness,
  };
}

describe("TenantDouyinMiniappReleasesService", () => {
  test("lists only sanitized releases with bounded pagination", async () => {
    const context = fixture();

    const result = await context.service.list(
      tenantContext(["douyin_miniapp.read"]),
      { page: 1, pageSize: 20 },
    );

    expect(context.releases.listByInstallation).toHaveBeenCalledWith({
      installationId: INSTALLATION_ID,
      page: 1,
      pageSize: 20,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.list[0]).not.toHaveProperty("ext_json");
    expect(result.list[0]).not.toHaveProperty("douyin_log_id");
    expect(result.list[0]).not.toHaveProperty("platform_operator_id");
  });

  test("rejects a release owned by another tenant", async () => {
    const context = fixture({
      foundRelease: release({ installation_id: OTHER_INSTALLATION_ID }),
    });

    await expect(context.service.getTestQr(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "DOUYIN_RELEASE_NOT_FOUND",
    });
    expect(context.operations.getTestQr).not.toHaveBeenCalled();
  });

  test("allows tenant audit submit with its dedicated permission", async () => {
    const context = fixture();
    const input = {
      host_names: ["douyin.com"],
      audit_note: "装修行业租户联调版本",
    };

    await context.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      input,
    );

    expect(context.operations.submitAudit).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      expect.objectContaining({ id: RELEASE_ID }),
      EMPLOYEE_ID,
      input,
    );
    expect(context.readiness.evaluateTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ["douyin.com"],
    );
  });

  test("blocks audit submit when release readiness still has blockers", async () => {
    const context = fixture();
    context.readiness.evaluateTenant.mockResolvedValue(blockedReadiness);

    await expect(context.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_RELEASE_NOT_READY",
      details: { blocker_codes: ["BUDGET_PRICING_MISSING"] },
    });
    expect(context.operations.submitAudit).not.toHaveBeenCalled();
  });

  test("creates a test version from the server-owned current template", async () => {
    const context = fixture();

    const result = await context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
    );

    expect(context.templates.findCurrent).toHaveBeenCalledWith("default");
    expect(context.operations.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      EMPLOYEE_ID,
      {
        template_id: deployableTemplate.template_id,
        template_version: deployableTemplate.template_version,
        description: deployableTemplate.description,
        channel: "default",
      },
    );
    expect(context.operations.getTestQr).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      expect.objectContaining({
        id: "77777777-7777-4777-8777-777777777777",
      }),
      EMPLOYEE_ID,
    );
    expect(result).not.toHaveProperty("ext_json");
  });

  test("publishes only an owned release with the production permission", async () => {
    const context = fixture({
      foundRelease: release({ status: "audit_approved" }),
    });

    await context.service.publish(
      tenantContext(["douyin_miniapp.publish"]),
      RELEASE_ID,
    );

    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "douyin_miniapp.publish",
    );
    expect(context.operations.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      expect.objectContaining({ id: RELEASE_ID, status: "audit_approved" }),
      EMPLOYEE_ID,
    );
  });

  test("rejects creating a test version before platform confirms a template", async () => {
    const context = fixture();
    context.templates.findCurrent.mockResolvedValue(null);

    await expect(context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
    )).rejects.toMatchObject({
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND",
    });
    expect(context.operations.upload).not.toHaveBeenCalled();
  });

  test("rejects a current template version that is not newer than the latest release", async () => {
    const context = fixture({
      latestRelease: release({
        status: "audit_rejected",
        template_id: "77595",
        template_version: "0.1.3",
        description: "较新的审核记录",
      }),
    });
    context.templates.findCurrent.mockResolvedValue({
      ...deployableTemplate,
      template_id: "78149",
      template_version: "0.1.2",
      description: "旧模板误设为当前",
    });

    await expect(context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_VERSION_NOT_NEW",
    });
    expect(context.operations.upload).not.toHaveBeenCalled();
  });

  test("recovers the tenant's created release before starting a newer template", async () => {
    const createdRelease = release({ status: "created" });
    const context = fixture({
      latestRelease: createdRelease,
      foundRelease: createdRelease,
    });

    await context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
    );

    expect(context.operations.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      EMPLOYEE_ID,
      {
        template_id: createdRelease.template_id,
        template_version: createdRelease.template_version,
        description: createdRelease.description,
        channel: createdRelease.channel,
      },
    );
    expect(context.releases.findById).toHaveBeenCalledWith(createdRelease.id);
    expect(context.templates.findCurrent).not.toHaveBeenCalled();
  });

  test("does not replace any unfinished release with a newer template", async () => {
    for (const status of [
      "uploaded",
      "testing",
      "audit_pending",
      "audit_approved",
    ] as const) {
      const context = fixture({ latestRelease: release({ status }) });

      await expect(context.service.createFromCurrentTemplate(
        tenantContext(["douyin_miniapp.manage"]),
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "DOUYIN_TENANT_RELEASE_IN_PROGRESS",
      });
      expect(context.operations.upload).not.toHaveBeenCalled();
    }
  });

  test("requires published profile and a test QR before audit submit", async () => {
    const unpublished = fixture({ profile: { status: "draft" } });
    await expect(unpublished.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });

    const noQr = fixture({
      foundRelease: release({ test_qr_url: null }),
    });
    await expect(noQr.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });

    const expiredQr = fixture({
      foundRelease: release({
        test_qr_url:
          "https://p3-developer-sign.bytemaimg.com/test.jpeg?x-expires=1",
      }),
    });
    await expect(expiredQr.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });
  });

  test("uses distinct permissions for preview, audit, and sync", async () => {
    const preview = fixture();
    await preview.service.getTestQr(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    );
    expect(preview.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "douyin_miniapp.manage",
    );

    const sync = fixture();
    await sync.service.syncStatus(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    );
    expect(sync.operations.syncStatus).toHaveBeenCalledTimes(1);
  });
});
