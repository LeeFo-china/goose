import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller:
  typeof import(".").TenantDouyinMiniappController;

beforeAll(async () => {
  ({ TenantDouyinMiniappController: Controller } = await import("."));
});

const authContext = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  employeeId: "44444444-4444-4444-8444-444444444444",
  tenantId: "33333333-3333-4333-8333-333333333333",
  permissions: [{ code: "douyin_miniapp.read", scope: "all" }],
};

const workspaceData = {
  tenant: { id: authContext.tenantId, name: "示例租户" },
  authorization_state: "unbound" as const,
  release_state: "not_uploaded" as const,
  installation: null,
  public_profile: null,
  public_content: {
    cases: 0,
    sites: 0,
    active_service_areas: 0,
  },
  latest_release: null,
};

function createController() {
  const workspace = {
    getWorkspace: mock(async () => workspaceData),
  };
  const authorization = {
    startAuthorization: mock(async () => ({
      link: "https://open.douyin.com/authorize/example",
      intent_expires_at: "2026-07-26T10:10:00.000Z",
    })),
    completeAuthorizationCallback: mock(async () => ({
      status: "completed" as const,
      authorizer_appid: "tt-authorizer",
    })),
  };
  const releases = {
    list: mock(async () => ({ list: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } })),
    getTestQr: mock(async () => ({ id: "release-id", status: "testing" })),
    submitAudit: mock(async () => ({
      id: "release-id", status: "audit_pending",
    })),
    syncStatus: mock(async () => ({
      id: "release-id", status: "audit_approved",
    })),
  };
  const controller = new Controller(
    workspace as never,
    () => authorization as never,
    async () => releases as never,
  );
  (
    controller as unknown as Record<string, unknown>
  ).getRequiredTenantContext = mock(async () => authContext);
  return { controller, workspace, authorization, releases };
}

describe("TenantDouyinMiniappController", () => {
  test("registers the controller in the root route registry", async () => {
    const source = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();

    expect(source).toContain(
      'import TenantDouyinMiniappController from "@/controllers/tenant-douyin-miniapp";',
    );
    expect(source).toContain(
      "TenantDouyinMiniappController.registerExtraRoutes(app);",
    );
  });

  test("registers the tenant workspace route", () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/tenant/douyin-miniapp/workspace" },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/authorization-link",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/authorization-callback",
      },
      { method: "GET", path: "/tenant/douyin-miniapp/releases" },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/releases/:releaseId/test-qr",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/releases/:releaseId/submit-audit",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/releases/:releaseId/sync-status",
      },
    ]);
  });

  test("uses the authenticated tenant context and ResponseHandler.success", async () => {
    const { controller, workspace } = createController();

    const result = await controller.getWorkspace({} as never);

    expect(workspace.getWorkspace).toHaveBeenCalledWith(authContext);
    expect(result).toEqual({
      data: workspaceData,
      message: "success",
    });
  });

  test("starts authorization with the authenticated tenant context", async () => {
    const { controller, authorization } = createController();

    await expect(controller.startAuthorization({
      body: {},
    } as never)).resolves.toEqual({
      data: {
        link: "https://open.douyin.com/authorize/example",
        intent_expires_at: "2026-07-26T10:10:00.000Z",
      },
      message: "success",
    });
    expect(authorization.startAuthorization).toHaveBeenCalledWith(authContext);
  });

  test("validates and completes the authenticated authorization callback", async () => {
    const { controller, authorization } = createController();
    const body = {
      intent: "i".repeat(32),
      authorization_code: "authorization-code",
      expires_in: "7200",
    };

    await expect(controller.completeAuthorization({
      body,
    } as never)).resolves.toEqual({
      data: { status: "completed", authorizer_appid: "tt-authorizer" },
      message: "success",
    });
    expect(authorization.completeAuthorizationCallback).toHaveBeenCalledWith(
      authContext,
      { ...body, expires_in: 7200 },
    );
    await expect(controller.completeAuthorization({
      body: { ...body, intent: "short" },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("lists tenant releases with bounded pagination", async () => {
    const { controller, releases } = createController();
    await controller.listReleases({
      query: { page: "1", pageSize: "20" },
    } as never);
    expect(releases.list).toHaveBeenCalledWith(
      authContext,
      { page: 1, pageSize: 20 },
    );
    await expect(controller.listReleases({
      query: { page: "1", pageSize: "101" },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("validates and delegates tenant release actions without publish", async () => {
    const { controller, releases } = createController();
    const params = { releaseId: "77777777-7777-4777-8777-777777777777" };

    await controller.getReleaseTestQr({ params, body: {} } as never);
    await controller.submitReleaseAudit({
      params,
      body: {
        host_names: ["douyin.com"],
        audit_note: "装修行业租户联调版本",
      },
    } as never);
    await controller.syncReleaseStatus({ params, body: {} } as never);

    expect(releases.getTestQr).toHaveBeenCalledWith(
      authContext,
      params.releaseId,
    );
    expect(releases.submitAudit).toHaveBeenCalledWith(
      authContext,
      params.releaseId,
      {
        host_names: ["douyin.com"],
        audit_note: "装修行业租户联调版本",
      },
    );
    expect(releases.syncStatus).toHaveBeenCalledWith(
      authContext,
      params.releaseId,
    );
    expect("publishRelease" in controller).toBe(false);
  });
});
