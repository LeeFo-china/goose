import { beforeAll, describe, expect, mock, test } from "bun:test";

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

function tenantContext(
  permissions: string[] = [
    "douyin_miniapp.read",
    "douyin_miniapp.manage",
    "douyin_miniapp.audit.submit",
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
    getTestQr: mock(async () => release()),
    submitAudit: mock(async () => release({ status: "audit_pending" })),
    syncStatus: mock(async () => release({ status: "audit_approved" })),
  };
  const service = new Service({
    workspace: workspace as never,
    installations: installations as never,
    releases: releases as never,
    accessPolicy: accessPolicy as never,
    operations: operations as never,
  });
  return {
    service,
    workspace,
    installations,
    releases,
    accessPolicy,
    operations,
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

  test("allows tenant audit submit but exposes no publish method", async () => {
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
    expect("publish" in context.service).toBe(false);
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
