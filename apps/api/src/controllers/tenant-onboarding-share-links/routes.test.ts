import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const context: AuthContext = {
  authUserId: "00000000-0000-4000-8000-000000000001",
  employeeId: "00000000-0000-4000-8000-000000000002",
  tenantId: "00000000-0000-4000-8000-000000000003",
  tenantName: "晴天装饰",
  tenantSlug: "sunny",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "张三",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
};

const create = mock(async () => ({ share_token: "tnob_abcdefghijklmnopqrstuvwxyz" }));
const recordOpen = mock(async () => ({ valid: true }));
const list = mock(async () => ({ list: [], pagination: {} }));
const listApplications = mock(async () => ({ list: [], pagination: {} }));
const getRequiredAuthContext = mock(async () => context);
const assertPlatformSession = mock(async (value: AuthContext) => value);

mock.module("@/services/tenant-onboarding-share-links", () => ({
  tenantOnboardingShareLinksService: {
    create,
    recordOpen,
    list,
    listApplications,
  },
}));
mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));
mock.module("@/services/platform-authorization", () => ({
  platformAuthorizationService: { assertPlatformSession },
}));

beforeEach(() => {
  for (const method of [
    create,
    recordOpen,
    list,
    listApplications,
    getRequiredAuthContext,
    assertPlatformSession,
  ]) method.mockClear();
});

const request = (overrides: Partial<FastifyRequest> = {}) => ({
  body: {},
  headers: {},
  params: {},
  query: {},
  user: { sub: context.authUserId, openid: "openid-1" },
  ...overrides,
}) as FastifyRequest;

describe("TenantOnboardingShareLinksController routes", () => {
  test("registers create, open and paginated statistics routes", async () => {
    const controller = (await import("./index")).default;
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);
    expect(routes).toEqual([
      { method: "POST", path: "/tenant-onboarding/share-links" },
      { method: "POST", path: "/tenant-onboarding/share-links/:token/open" },
      { method: "GET", path: "/tenant-onboarding/share-links" },
      { method: "GET", path: "/tenant-onboarding/share-links/:id/applications" },
    ]);
  });

  test("creates a link from authenticated employee context and a UUID key", async () => {
    const controller = (await import("./index")).default;
    await controller.createShareLink(request({
      headers: { "idempotency-key": "00000000-0000-4000-8000-000000000004" },
    }));
    expect(create).toHaveBeenCalledWith({
      authContext: context,
      openid: "openid-1",
      idempotencyKey: "00000000-0000-4000-8000-000000000004",
    });
  });

  test("uses visitor identity only for the non-blocking open event", async () => {
    const controller = (await import("./index")).default;
    await controller.recordOpen(request({
      params: { token: "tnob_abcdefghijklmnopqrstuvwxyz" },
      user: { token_type: "visitor_session", visitor_id: "visitor-1" },
    }));
    expect(recordOpen).toHaveBeenCalledWith({
      token: "tnob_abcdefghijklmnopqrstuvwxyz",
      visitorId: "visitor-1",
    });
    expect(getRequiredAuthContext).not.toHaveBeenCalled();
  });

  test("requires the current employee to own application statistics", async () => {
    const controller = (await import("./index")).default;
    await controller.listApplications(request({
      params: { id: "00000000-0000-4000-8000-000000000005" },
      query: { page: "2", pageSize: "30" },
    }));
    expect(listApplications).toHaveBeenCalledWith({
      authContext: context,
      shareLinkId: "00000000-0000-4000-8000-000000000005",
      page: 2,
      pageSize: 30,
    });
  });
});
