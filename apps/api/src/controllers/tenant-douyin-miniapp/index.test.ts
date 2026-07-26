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
  const controller = new Controller(workspace as never);
  (
    controller as unknown as Record<string, unknown>
  ).getRequiredTenantContext = mock(async () => authContext);
  return { controller, workspace };
}

describe("TenantDouyinMiniappController", () => {
  test("registers the tenant workspace route", () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/tenant/douyin-miniapp/workspace" },
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
});
