import { mock } from "bun:test";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service:
  typeof import("./releases").TenantDouyinMiniappReleasesService;

export async function initializeReleaseService() {
  ({ TenantDouyinMiniappReleasesService: Service } = await import(
    "./releases"
  ));
}

export const TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
export const INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_INSTALLATION_ID = "44444444-4444-4444-8444-444444444444";
export const RELEASE_ID = "55555555-5555-4555-8555-555555555555";
export const deployableTemplate = {
  id: "77777777-7777-4777-8777-777777777777",
  template_app_id: "tt-template",
  source_draft_id: "1024",
  template_id: "77596",
  template_version: "0.1.4",
  description: "租户发布闭环",
  channel: "default" as const,
  is_current: true,
  is_tenant_selectable: true,
  confirmed_by_employee_id: EMPLOYEE_ID,
  confirmed_at: "2026-09-17T10:00:00.000Z",
  selectability_updated_at: "2026-09-17T10:00:00.000Z",
  selectability_updated_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-09-17T10:00:00.000Z",
};
export const selectedTemplate = {
  expected_template_record_id: deployableTemplate.id,
  expected_template_id: deployableTemplate.template_id,
};
const readyReadiness: DouyinReleaseReadiness = {
  ready: true,
  checked_at: "2026-08-20T10:00:00.000Z",
  tenant: { id: TENANT_ID, name: "验收租户" },
  blockers: [],
  warnings: [],
  metrics: {},
};
export const blockedReadiness: DouyinReleaseReadiness = {
  ...readyReadiness,
  ready: false,
  blockers: [{
    severity: "blocker" as const,
    code: "BUDGET_PRICING_MISSING" as const,
    message: "预算报价未启用",
    details: {},
  }],
};

export function tenantContext(
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

export function release(overrides: Record<string, unknown> = {}) {
  return {
    id: RELEASE_ID,
    installation_id: INSTALLATION_ID,
    template_id: "77595",
    template_version: "0.1.2",
    description: "租户联调版本",
    provider_summary: null,
    channel: "default" as const,
    ext_json: {
      extEnable: true as const,
      extAppid: "tt-authorizer",
      ext: { deployment_key: "secret-deployment-key" },
    },
    status: "testing" as const,
    douyin_log_id: "provider-log",
    test_qr_url: "https://example.test/test-qr.png",
    latest_test_qr_url: "https://example.test/test-qr.png",
    audit_qr_url: null,
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

export function fixture(options: {
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
  const accessTokens = {
    getAuthorizerAccessToken: mock(async () => "authorizer-access-token"),
  };
  const gateway = {
    getVersionList: mock(async () => ({
      latest: { version: "0.1.2", summary: "租户联调版本" },
      logId: "versions-log",
    })),
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
    accessTokens: accessTokens as never,
    gateway: gateway as never,
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
    accessTokens,
    gateway,
    readiness,
  };
}
