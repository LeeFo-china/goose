import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOW = "2026-09-18T08:00:00.000Z";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const LINK_ID = "00000000-0000-4000-8000-000000000003";
const TOKEN = "tnob_abcdefghijklmnopqrstuvwxyz";

const context: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
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

const link = {
  id: LINK_ID,
  share_token: TOKEN,
  sharer_user_id: USER_ID,
  sharer_employee_id: EMPLOYEE_ID,
  sharer_openid: "openid-1",
  sharer_display_name: "张三",
  expires_at: "2026-10-18T08:00:00.000Z",
  created_at: NOW,
};

const repository = {
  createOrFind: mock(async () => link),
  recordOpen: mock(async (): Promise<{
    valid: boolean;
    sharer_display_name: string | null;
  }> => ({ valid: true, sharer_display_name: "张三" })),
  list: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findOwnedById: mock(async (): Promise<typeof link | null> => link),
  listApplications: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
};

async function createService() {
  const { TenantOnboardingShareLinksService } = await import(
    "./tenant-onboarding-share-links"
  );
  return new TenantOnboardingShareLinksService({
    repository,
    tokenGenerator: () => TOKEN,
    clock: () => new Date(NOW),
  });
}

describe("TenantOnboardingShareLinksService", () => {
  test("creates an opaque expiring share link with server-owned identity", async () => {
    const result = await (await createService()).create({
      authContext: context,
      openid: "openid-1",
      idempotencyKey: "00000000-0000-4000-8000-000000000004",
    });

    expect(repository.createOrFind).toHaveBeenCalledWith({
      shareToken: TOKEN,
      sharerUserId: USER_ID,
      sharerEmployeeId: EMPLOYEE_ID,
      sharerOpenid: "openid-1",
      sharerDisplayName: "张三",
      idempotencyKey: "00000000-0000-4000-8000-000000000004",
      expiresAt: "2026-10-18T08:00:00.000Z",
      now: NOW,
    });
    expect(result).toEqual({
      share_token: TOKEN,
      path:
        "/packageVisitor/pages/tenant-onboarding/index?source=local_services&share_token=" +
        TOKEN,
      title: "好店智装云邀你入驻",
      expires_at: "2026-10-18T08:00:00.000Z",
      sharer: { user_id: USER_ID, display_name: "张三" },
    });
  });

  test("records an open while invalid tokens degrade without blocking", async () => {
    const service = await createService();
    expect(await service.recordOpen({ token: TOKEN, visitorId: "visitor-1" }))
      .toEqual({
        valid: true,
        share_token: TOKEN,
        sharer_display_name: "张三",
      });
    expect(repository.recordOpen).toHaveBeenCalledWith({
      token: TOKEN,
      visitorId: "visitor-1",
      now: NOW,
    });

    repository.recordOpen.mockImplementationOnce(async () => ({
      valid: false,
      sharer_display_name: null,
    }));
    expect(await service.recordOpen({ token: TOKEN, visitorId: "visitor-1" }))
      .toEqual({ valid: false, share_token: null, sharer_display_name: null });
  });

  test("scopes paginated statistics and applications to the current sharer", async () => {
    const service = await createService();
    await service.list({ authContext: context, page: 2, pageSize: 30 });
    expect(repository.list).toHaveBeenCalledWith({
      sharerUserId: USER_ID,
      page: 2,
      pageSize: 30,
    });

    await service.listApplications({
      authContext: context,
      shareLinkId: LINK_ID,
      page: 1,
      pageSize: 20,
    });
    expect(repository.findOwnedById).toHaveBeenCalledWith(LINK_ID, USER_ID);
    expect(repository.listApplications).toHaveBeenCalledWith({
      shareLinkId: LINK_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("requires an employee identity and prevents reading another sharer's link", async () => {
    const service = await createService();
    await expect(service.create({
      authContext: { ...context, employeeId: null },
      openid: null,
      idempotencyKey: "00000000-0000-4000-8000-000000000004",
    })).rejects.toMatchObject({ statusCode: 403 });

    repository.findOwnedById.mockImplementationOnce(async () => null);
    await expect(service.listApplications({
      authContext: context,
      shareLinkId: LINK_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});
