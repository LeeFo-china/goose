import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller: typeof import(".").TenantDouyinBudgetController;

beforeAll(async () => {
  ({ TenantDouyinBudgetController: Controller } = await import("."));
});

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const authContext = {
  tenantId: "22222222-2222-4222-8222-222222222222",
  employeeId: "33333333-3333-4333-8333-333333333333",
  permissions: [{ code: "douyin_miniapp.manage", scope: "all" }],
};
const actionBody = { expected_updated_at: "2026-08-21T08:00:00.123456+00:00" };
const factorBody = {
  ...actionBody,
  factor_payload: {
    layout_coefficients_bps: {
      one_bedroom_one_living: 10_000,
      two_bedroom_one_living: 10_000,
      two_bedroom_two_living: 10_100,
      three_bedroom_one_living: 10_150,
      three_bedroom_two_living: 10_200,
      four_bedroom_two_living: 10_350,
      villa_duplex: 10_800,
      custom: 10_000,
    },
    style_coefficients_bps: {
      modern_simple: 10_000,
      cream: 10_300,
      new_chinese: 10_800,
      nordic: 10_200,
      light_luxury: 10_700,
      natural_wood: 10_300,
      american: 10_600,
      french: 10_800,
      wabi_sabi: 10_700,
      custom: 10_000,
    },
  },
};

function createController() {
  const service = {
    list: mock(async () => ({
      active_version: null,
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    createDraft: mock(async () => ({ id: VERSION_ID })),
    replaceItems: mock(async () => ({ id: VERSION_ID })),
    updateFactors: mock(async () => ({ id: VERSION_ID })),
    activate: mock(async () => ({ id: VERSION_ID, status: "active" })),
    archive: mock(async () => ({ id: VERSION_ID, status: "archived" })),
  };
  const controller = new Controller(service as never);
  const getRequiredTenantContext = mock(async () => authContext);
  (controller as unknown as Record<string, unknown>).getRequiredTenantContext =
    getRequiredTenantContext;
  return { controller, service, getRequiredTenantContext };
}

describe("TenantDouyinBudgetController", () => {
  test("registers the six management routes and root registry", async () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      put: (path: string) => routes.push({ method: "PUT", path }),
    };
    controller.registerExtraRoutes(fastify as never);
    expect(routes).toEqual([
      {
        method: "GET",
        path: "/tenant/douyin-miniapp/budget/pricing-versions",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/budget/pricing-versions",
      },
      {
        method: "PUT",
        path: "/tenant/douyin-miniapp/budget/pricing-versions/:id/items",
      },
      {
        method: "PUT",
        path: "/tenant/douyin-miniapp/budget/pricing-versions/:id/factors",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/budget/pricing-versions/:id/activate",
      },
      {
        method: "POST",
        path: "/tenant/douyin-miniapp/budget/pricing-versions/:id/archive",
      },
    ]);
    const source = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    expect(source).toContain(
      'import TenantDouyinBudgetController from "@/controllers/tenant-douyin-budget";',
    );
    expect(source).toContain(
      "TenantDouyinBudgetController.registerExtraRoutes(app);",
    );
  });

  test("validates pagination before auth and echoes defaults", async () => {
    const invalid = createController();
    await expect(invalid.controller.listVersions({
      query: { pageSize: 101 },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();

    const valid = createController();
    await valid.controller.listVersions({ query: {} } as never);
    expect(valid.service.list).toHaveBeenCalledWith(authContext, {
      page: 1,
      pageSize: 20,
    });
  });

  test("validates strict draft/item/action input before auth", async () => {
    const context = createController();
    await expect(context.controller.createDraft({ body: {
      effective_from: "2026-08-21T00:00:00.000Z",
      effective_to: null,
      disclaimer: "初步估算，不构成最终报价",
      tenant_id: authContext.tenantId,
    } } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.replaceItems({
      params: { id: VERSION_ID },
      body: { ...actionBody, items: [] },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.updateFactors({
      params: { id: VERSION_ID },
      body: { ...factorBody, factor_payload: {
        ...factorBody.factor_payload,
        layout_coefficients_bps: {
          ...factorBody.factor_payload.layout_coefficients_bps,
          unknown: 10_000,
        },
      } },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.activate({
      params: { id: "bad" }, body: actionBody,
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.archive({
      params: { id: VERSION_ID },
      body: { ...actionBody, force: true },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(context.getRequiredTenantContext).not.toHaveBeenCalled();
  });

  test("delegates scoped activation/archive and wraps success", async () => {
    const context = createController();
    await expect(context.controller.activate({
      params: { id: VERSION_ID }, body: actionBody,
    } as never)).resolves.toMatchObject({
      data: { id: VERSION_ID, status: "active" },
      message: "success",
    });
    await context.controller.archive({
      params: { id: VERSION_ID }, body: actionBody,
    } as never);
    expect(context.service.activate).toHaveBeenCalledWith(
      authContext,
      VERSION_ID,
      actionBody,
    );
    expect(context.service.archive).toHaveBeenCalledWith(
      authContext,
      VERSION_ID,
      actionBody,
    );
  });

  test("delegates scoped factor updates and wraps success", async () => {
    const context = createController();
    await expect(context.controller.updateFactors({
      params: { id: VERSION_ID },
      body: factorBody,
    } as never)).resolves.toMatchObject({
      data: { id: VERSION_ID },
      message: "success",
    });
    expect(context.service.updateFactors).toHaveBeenCalledWith(
      authContext,
      VERSION_ID,
      factorBody,
    );
  });
});
