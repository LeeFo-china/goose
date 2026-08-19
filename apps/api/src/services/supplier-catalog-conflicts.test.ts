import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";

async function createService(overrides: Record<string, unknown>) {
  const repository = {
    createCategory: mock(async () => ({ id: CATEGORY_ID })),
    createBrand: mock(async () => ({ id: CATEGORY_ID })),
    ...overrides,
  };
  const { SupplierCatalogService } = await import("./supplier-catalog");
  return new SupplierCatalogService({
    repository,
    settingsRepository: { getSettings: mock(async () => null) },
    accessPolicy: {
      assertTenantContext: mock(() => ""),
      assertPermission: mock(() => "all"),
    },
    commandIdFactory: () => CATEGORY_ID,
  } as never);
}

describe("SupplierCatalogService database conflict mapping", () => {
  test("maps create idempotency database conflicts without hiding others", async () => {
    let categoryCalls = 0;
    const idempotencyConflict = {
      code: "DB_ERROR",
      details: { code: "P0001", message: "SUPPLIER_IDEMPOTENCY_CONFLICT" },
    };
    const service = await createService({
      createCategory: mock(async () => {
        categoryCalls += 1;
        if (categoryCalls === 1) return { id: CATEGORY_ID };
        throw idempotencyConflict;
      }),
      createBrand: mock(async () => {
        throw idempotencyConflict;
      }),
    });
    const createCategory = (name: string) => service.createCategory(
      platformAuth,
      {
        parent_id: null,
        code: "CAT-001",
        name,
        level: 1,
        status: "active",
        sort_order: 100,
      },
      "catalog-conflict-1",
    );

    await createCategory("主材");
    await expect(createCategory("辅材")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
    await expect(service.createBrand(
      platformAuth,
      { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
      "catalog-conflict-1",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
  });

  test("maps unique and hierarchy database violations to one stable error", async () => {
    const violations = [
      { code: "23505", message: "duplicate key" },
      { message: "目录分类层级不能形成环" },
      { message: "存在启用的子分类，当前目录分类不能停用" },
      { message: "启用的目录分类必须属于启用的父分类" },
      { message: "派生单位只能引用启用的基准单位" },
      { message: "有派生单位引用的基准单位不能停用" },
    ];

    for (const violation of violations) {
      const service = await createService({
        createCategory: mock(async () => {
          throw { code: "DB_ERROR", details: violation };
        }),
      });
      await expect(service.createCategory(
        platformAuth,
        {
          parent_id: null,
          code: "CAT-001",
          name: "主材",
          level: 1,
          status: "active",
          sort_order: 100,
        },
        "category-create",
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_CATALOG_CONFLICT",
      });
    }
  });

  test("does not hide unrelated database failures", async () => {
    const original = {
      code: "DB_ERROR",
      details: { code: "42P01", message: "missing relation" },
    };
    const service = await createService({
      createBrand: mock(async () => {
        throw original;
      }),
    });

    await expect(service.createBrand(
      platformAuth,
      { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
      "brand-create",
    )).rejects.toBe(original);
  });
});

const platformAuth: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "目录管理员",
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
  permissions: [{ code: "platform.catalog.manage", scope: "all" }],
};
