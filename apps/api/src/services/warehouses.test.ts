import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type AuthContext = import("@/services/authorization").AuthContext;

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WAREHOUSE_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000001";

const warehouse = {
  id: WAREHOUSE_ID,
  tenant_id: TENANT_ID,
  warehouse_code: "WH-000001",
  name: "公司仓库",
  address: null,
  contact_name: null,
  contact_phone: null,
  manager_employee_id: null,
  is_default: true,
  status: "active" as const,
  version: 1,
  created_at: "2026-09-05T00:00:00.000Z",
  updated_at: "2026-09-05T00:00:00.000Z",
};

function auth(codes: string[]): AuthContext {
  return {
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
    permissions: codes.map((code) => ({ code, scope: "all" as const })),
  };
}

function serviceWith(repository: {
  list?: ReturnType<typeof mock>;
  findById?: ReturnType<typeof mock>;
  create?: ReturnType<typeof mock>;
  update?: ReturnType<typeof mock>;
}) {
  return import("./warehouses").then(({ WarehousesService }) =>
    new WarehousesService({
      repository: {
        list: repository.list ?? mock(async () => ({
          list: [warehouse],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })),
        findById: repository.findById ?? mock(async () => warehouse),
        create: repository.create ?? mock(async () => warehouse),
        update: repository.update ?? mock(async () => warehouse),
      },
    })
  );
}

describe("WarehousesService", () => {
  test("lists warehouses with read permission and tenant scope", async () => {
    const list = mock(async () => ({
      list: [warehouse],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    const service = await serviceWith({ list });

    await service.list(auth(["inventory.warehouse.view"]), {
      page: 1,
      pageSize: 20,
    });

    expect(list).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("requires manage permission and actor identity for mutations", async () => {
    const create = mock(async () => warehouse);
    const service = await serviceWith({ create });

    await expect(service.create(auth([]), {
      id: WAREHOUSE_ID,
      name: "公司仓库",
      is_default: false,
    }, "key-1")).rejects.toMatchObject({ statusCode: 403 });

    await service.create(auth(["inventory.warehouse.manage"]), {
      id: WAREHOUSE_ID,
      name: "公司仓库",
      is_default: false,
    }, "key-1");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      warehouse_id: WAREHOUSE_ID,
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "key-1",
    }));
  });

  test("returns stable not found and warehouse conflict errors", async () => {
    const findById = mock(async () => null);
    const update = mock(async () => {
      const { Errors } = await import("@/errors/error-factory");
      throw Errors.dbError("更新仓库失败", {
        message: "WAREHOUSE_VERSION_CONFLICT",
      });
    });
    const service = await serviceWith({ findById, update });

    await expect(service.get(
      auth(["inventory.warehouse.view"]),
      WAREHOUSE_ID,
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "WAREHOUSE_NOT_FOUND",
    });
    await expect(service.update(
      auth(["inventory.warehouse.manage"]),
      WAREHOUSE_ID,
      { expected_version: 1, name: "主仓" },
      "key-2",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WAREHOUSE_STATE_CONFLICT",
      message: "仓库状态已变化，请刷新后重试",
    });
  });

  test("maps default warehouse guard errors to stable business responses", async () => {
    const { Errors } = await import("@/errors/error-factory");
    const update = mock(async () => {
      throw Errors.dbError("更新仓库失败", {
        message: "WAREHOUSE_DEFAULT_REQUIRED",
      });
    });
    const service = await serviceWith({ update });

    await expect(service.update(
      auth(["inventory.warehouse.manage"]),
      WAREHOUSE_ID,
      { expected_version: 1, status: "inactive" },
      "key-4",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "WAREHOUSE_DEFAULT_REQUIRED",
      message: "请先设置其他默认仓库",
    });
  });

  test("does not forward undefined optional update fields as submitted fields", async () => {
    const update = mock(async () => warehouse);
    const service = await serviceWith({ update });

    await service.update(
      auth(["inventory.warehouse.manage"]),
      WAREHOUSE_ID,
      { expected_version: 1, address: undefined, contact_name: null },
      "key-3",
    );

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
      address: undefined,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      contact_name: null,
    }));
  });
});
