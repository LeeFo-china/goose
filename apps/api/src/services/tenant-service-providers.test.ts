import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function createService(deps: ReturnType<typeof dependencies>) {
  const { TenantServiceProvidersService } = await import(
    "@/services/tenant-service-providers"
  );
  return new TenantServiceProvidersService(deps as never);
}

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000102";
const VISITOR_ID = "visitor-1";
const authContext = {
  tenantId: TENANT_ID,
  employeeId: EMPLOYEE_ID,
  isPlatformAdmin: false,
  permissions: [{ code: "service_provider.profile.manage", scope: "all" }],
} as AuthContext;
const platformContext = {
  tenantId: null,
  employeeId: EMPLOYEE_ID,
  isPlatformAdmin: true,
  permissions: [{ code: "platform.service_provider.publish", scope: "all" }],
} as AuthContext;
const profile = {
  id: "00000000-0000-4000-8000-000000000201",
  tenant_id: TENANT_ID,
  public_name: "青田装饰",
  introduction: null,
  public_phone: "13912349000",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "浉河区",
  address_region_code: "411502",
  address: "东方红大道 1 号",
  address_latitude: 32.12,
  address_longitude: 114.08,
  status: "draft" as const,
  version: 2,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  published_at: null,
  suspended_at: null,
  created_at: "2026-07-14T00:00:00.000Z",
  updated_at: "2026-07-14T00:00:00.000Z",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    repository: {
      getTenantProfile: mock(async () => profile),
      updateTenantProfile: mock(async () => ({ status: "updated", profile: { ...profile, version: 3 } })),
      listTenantAreas: mock(async ({ page, pageSize }) => ({
        list: [], pagination: { page, pageSize, total: 0, totalPages: 0 },
      })),
      createTenantArea: mock(async () => ({ status: "updated", profile: { ...profile, version: 3 }, area: null })),
      updateTenantArea: mock(async () => ({ status: "updated", profile: { ...profile, version: 3 }, area: null })),
      submitTenantProfile: mock(async () => ({ status: "updated", profile: { ...profile, status: "pending_review", version: 3 } })),
      listPlatformPublicationQueue: mock(async ({ page, pageSize }) => ({
        list: [], pagination: { page, pageSize, total: 0, totalPages: 0 },
      })),
      getPlatformPublicationDetail: mock(async () => profile),
      listPlatformPublicationAreas: mock(async ({ page, pageSize }) => ({
        list: [], pagination: { page, pageSize, total: 0, totalPages: 0 },
      })),
      publishProfile: mock(async (): Promise<{
        status: string;
        profile?: Record<string, unknown>;
      }> => ({
        status: "updated",
        profile: { ...profile, status: "published", version: 3 },
      })),
      returnProfileToDraft: mock(async () => ({ status: "updated", profile: { ...profile, version: 3 } })),
      suspendProfile: mock(async () => ({ status: "updated", profile: { ...profile, status: "suspended", version: 3 } })),
      resolveActiveRegionCodes: mock(async () => ["411502", "411500", "410000"]),
      listVisitorProviders: mock(async ({ page, pageSize }) => ({
        list: [], pagination: { page, pageSize, total: 0, totalPages: 0 },
      })),
    },
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => context.tenantId),
      assertPermission: mock(() => "all"),
    },
    audit: { recordBestEffort: mock(async () => null) },
    locationContexts: { findLatestActiveForVisitor: mock(async () => null) },
    ...overrides,
  };
}

describe("TenantServiceProvidersService", () => {
  test("scopes tenant profile reads and writes to auth tenant", async () => {
    const deps = dependencies();
    const service = await createService(deps);

    await service.getTenantProfile(authContext);
    await service.updateTenantProfile(authContext, { version: 2, public_name: "新名称" });

    expect(deps.accessPolicy.assertPermission).toHaveBeenCalledWith(
      authContext,
      "service_provider.profile.manage",
    );
    expect(deps.repository.getTenantProfile).toHaveBeenCalledWith(TENANT_ID);
    expect(deps.repository.updateTenantProfile).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      expectedVersion: 2,
      patch: { public_name: "新名称" },
    });
  });

  test("requires platform publish permission and audits only successful publish", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    await service.publish(platformContext, TENANT_ID, { version: 2, review_remark: "资料完整" });

    expect(deps.accessPolicy.assertPermission).toHaveBeenCalledWith(
      platformContext,
      "platform.service_provider.publish",
    );
    expect(deps.audit.recordBestEffort).toHaveBeenCalledTimes(1);
  });

  test("does not write a success audit when publication mutation fails", async () => {
    const deps = dependencies();
    deps.repository.publishProfile.mockImplementationOnce(async () => ({
      status: "version_conflict" as const,
    }));
    const service = await createService(deps);

    await expect(service.publish(platformContext, TENANT_ID, {
      version: 2,
      review_remark: "资料完整",
    })).rejects.toMatchObject({ code: "SERVICE_PROVIDER_STATE_CONFLICT" });
    expect(deps.audit.recordBestEffort).not.toHaveBeenCalled();
  });

  test("checks tenant permission before reading profile data", async () => {
    const deps = dependencies();
    deps.accessPolicy.assertPermission.mockImplementationOnce(() => {
      throw Object.assign(new Error("forbidden"), { statusCode: 403 });
    });
    const service = await createService(deps);

    await expect(service.getTenantProfile(authContext)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(deps.repository.getTenantProfile).not.toHaveBeenCalled();
  });

  test("returns empty visitor pagination without an active location context", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    const result = await service.listVisitorProviders(
      { token_type: "visitor_session", visitor_id: VISITOR_ID } as never,
      { page: 2, pageSize: 20 },
    );

    expect(result).toEqual({
      list: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(deps.repository.listVisitorProviders).not.toHaveBeenCalled();
  });

  test("passes only the active location adcode to the paginated visitor query", async () => {
    const deps = dependencies({
      locationContexts: {
        findLatestActiveForVisitor: mock(async () => ({
          id: "context-1", visitor_id: VISITOR_ID, adcode: "411502",
        })),
      },
    });
    const service = await createService(deps);
    await service.listVisitorProviders(
      { token_type: "visitor_session", visitor_id: VISITOR_ID } as never,
      { page: 1, pageSize: 500 },
    );

    expect(deps.repository.listVisitorProviders).toHaveBeenCalledWith({
      regionCodes: ["411502", "411500", "410000"],
      page: 1,
      pageSize: 100,
    });
  });

  test("does not fall back when the location region cannot be resolved", async () => {
    const deps = dependencies({
      locationContexts: {
        findLatestActiveForVisitor: mock(async () => ({
          id: "context-1", visitor_id: VISITOR_ID, adcode: "411502",
        })),
      },
    });
    deps.repository.resolveActiveRegionCodes.mockImplementationOnce(async () => []);
    const service = await createService(deps);
    const result = await service.listVisitorProviders(
      { token_type: "visitor_session", visitor_id: VISITOR_ID } as never,
      { page: 1, pageSize: 20 },
    );

    expect(result.list).toEqual([]);
    expect(deps.repository.listVisitorProviders).not.toHaveBeenCalled();
  });
});
