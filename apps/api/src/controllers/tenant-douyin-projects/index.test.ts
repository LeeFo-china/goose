import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller:
  typeof import(".").TenantDouyinProjectsController;

beforeAll(async () => {
  ({ TenantDouyinProjectsController: Controller } = await import("."));
});

const authContext = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  employeeId: "22222222-2222-4222-8222-222222222222",
  tenantId: "33333333-3333-4333-8333-333333333333",
  permissions: [{ code: "douyin_miniapp.manage", scope: "all" }],
};
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const body = {
  public_title: "现代简约实景",
  public_description: "这是一段用于公开展示的项目说明，介绍空间规划和施工亮点。",
  public_image_urls: [],
  style_tags: ["现代"],
  budget_band: null,
  publication_status: "draft" as const,
};

function createController() {
  const service = {
    list: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    updatePublication: mock(async () => ({
      id: "55555555-5555-4555-8555-555555555555",
      tenant_id: authContext.tenantId,
      project_id: PROJECT_ID,
      ...body,
      updated_at: "2026-08-21T00:00:00.000Z",
    })),
    listAttachedImages: mock(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
  };
  const controller = new Controller(service as never);
  const getRequiredTenantContext = mock(async () => authContext);
  (controller as unknown as Record<string, unknown>).getRequiredTenantContext =
    getRequiredTenantContext;
  return { controller, service, getRequiredTenantContext };
}

describe("TenantDouyinProjectsController", () => {
  test("registers real tenant project publication routes and root registry", async () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };
    controller.registerExtraRoutes(fastify as never);
    expect(routes).toEqual([
      { method: "GET", path: "/tenant/douyin-miniapp/projects" },
      {
        method: "PATCH",
        path: "/tenant/douyin-miniapp/projects/:projectId/publication",
      },
      {
        method: "GET",
        path: "/tenant/douyin-miniapp/projects/:projectId/images",
      },
    ]);

    const source = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    expect(source).toContain(
      'import TenantDouyinProjectsController from "@/controllers/tenant-douyin-projects";',
    );
    expect(source).toContain(
      "TenantDouyinProjectsController.registerExtraRoutes(app);",
    );
  });

  test("validates list query before auth and delegates authenticated context", async () => {
    const invalid = createController();
    await expect(invalid.controller.listProjects({
      query: { pageSize: "101" },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();
    expect(invalid.service.list).not.toHaveBeenCalled();

    const valid = createController();
    await expect(valid.controller.listProjects({
      query: {},
    } as never)).resolves.toEqual({
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      message: "success",
    });
    expect(valid.service.list).toHaveBeenCalledWith(authContext, {
      page: 1,
      pageSize: 20,
    });
  });

  test("validates strict publication input before service delegation", async () => {
    const context = createController();
    await expect(context.controller.updatePublication({
      params: { projectId: PROJECT_ID },
      body: { ...body, tenant_id: authContext.tenantId },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.updatePublication({
      params: { projectId: "bad" },
      body,
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    for (const reference of [
      "https://cdn.example.test/image.jpg?q-signature=x",
      "https:/cdn.example.test/image.jpg",
      "https:cdn.example.test/image.jpg",
      "HTTPS://cdn.example.test/image.jpg",
    ]) {
      await expect(context.controller.updatePublication({
        params: { projectId: PROJECT_ID },
        body: { ...body, public_image_urls: [reference] },
      } as never)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(context.getRequiredTenantContext).not.toHaveBeenCalled();
    expect(context.service.updatePublication).not.toHaveBeenCalled();
  });

  test("updates through authenticated context and wraps success", async () => {
    const context = createController();
    const result = await context.controller.updatePublication({
      params: { projectId: PROJECT_ID },
      body,
    } as never);
    expect(context.service.updatePublication).toHaveBeenCalledWith(
      authContext,
      PROJECT_ID,
      body,
    );
    expect(result).toMatchObject({
      data: { tenant_id: authContext.tenantId, project_id: PROJECT_ID },
      message: "success",
    });
  });

  test("validates image picker params/query before auth and wraps pagination", async () => {
    const invalid = createController();
    await expect(invalid.controller.listAttachedImages({
      params: { projectId: "bad" },
      query: {},
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(invalid.controller.listAttachedImages({
      params: { projectId: PROJECT_ID },
      query: { pageSize: 101 },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();
    expect(invalid.service.listAttachedImages).not.toHaveBeenCalled();

    const valid = createController();
    await expect(valid.controller.listAttachedImages({
      params: { projectId: PROJECT_ID },
      query: {},
    } as never)).resolves.toEqual({
      data: {
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
      message: "success",
    });
    expect(valid.service.listAttachedImages).toHaveBeenCalledWith(
      authContext,
      PROJECT_ID,
      { page: 1, pageSize: 20 },
    );
  });
});
