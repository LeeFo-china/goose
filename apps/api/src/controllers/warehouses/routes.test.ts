import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WAREHOUSE_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000001";

const authContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: null,
  tenantSlug: null,
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
  roleCodes: [],
  roles: [],
  permissions: [{ code: "inventory.warehouse.manage", scope: "all" }],
};

const list = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const get = mock(async () => ({ id: WAREHOUSE_ID }));
const create = mock(async () => ({ id: WAREHOUSE_ID }));
const update = mock(async () => ({ id: WAREHOUSE_ID }));

mock.module("@/services/warehouses", () => ({
  warehousesService: { list, get, create, update },
}));

function request(input: {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  idempotencyKey?: string;
}) {
  const rawHeaders = input.idempotencyKey
    ? ["Idempotency-Key", input.idempotencyKey]
    : [];
  return {
    params: input.params,
    query: input.query,
    body: input.body,
    headers: input.idempotencyKey
      ? { "idempotency-key": input.idempotencyKey }
      : {},
    raw: { rawHeaders },
  };
}

async function controller() {
  const { default: value } = await import(".");
  (value as unknown as {
    getRequiredTenantContext: () => Promise<typeof authContext>;
  }).getRequiredTenantContext = mock(async () => authContext);
  return value;
}

describe("WarehousesController routes", () => {
  beforeEach(() => {
    list.mockClear();
    get.mockClear();
    create.mockClear();
    update.mockClear();
  });

  test("registers warehouse routes and index route binding", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    const app = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    value.registerExtraRoutes(app as never);
    const routesIndex = await Bun.file(new URL(
      "../../routes/index.ts",
      import.meta.url,
    )).text();

    expect(routes).toEqual([
      { method: "GET", path: "/warehouses" },
      { method: "GET", path: "/warehouses/:id" },
      { method: "POST", path: "/warehouses" },
      { method: "PATCH", path: "/warehouses/:id" },
    ]);
    expect(routesIndex).toContain(
      'import WarehousesController from "@/controllers/warehouses";',
    );
    expect(routesIndex).toContain("WarehousesController.registerExtraRoutes(app);");
  });

  test("parses requests and requires idempotency key for writes", async () => {
    const value = await controller();

    await value.listWarehouses(request({
      query: { page: "2", pageSize: "20", keyword: " 主仓 " },
    }) as never);
    await value.getWarehouse(request({
      params: { id: WAREHOUSE_ID },
    }) as never);
    await value.createWarehouse(request({
      body: { id: WAREHOUSE_ID, name: "公司仓库" },
      idempotencyKey: "create-key",
    }) as never);
    await value.updateWarehouse(request({
      params: { id: WAREHOUSE_ID },
      body: { expected_version: 1, name: "主仓" },
      idempotencyKey: "update-key",
    }) as never);

    expect(list).toHaveBeenCalledWith(authContext, {
      page: 2,
      pageSize: 20,
      keyword: "主仓",
    });
    expect(get).toHaveBeenCalledWith(authContext, WAREHOUSE_ID);
    expect(create).toHaveBeenCalledWith(authContext, {
      id: WAREHOUSE_ID,
      name: "公司仓库",
      is_default: false,
    }, "create-key");
    expect(update).toHaveBeenCalledWith(authContext, WAREHOUSE_ID, {
      expected_version: 1,
      name: "主仓",
    }, "update-key");

    await expect(value.createWarehouse(request({
      body: { id: WAREHOUSE_ID, name: "公司仓库" },
    }) as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
