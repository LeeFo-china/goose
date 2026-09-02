import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "./authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "20000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000002";
const TARGET_ID = "20000000-0000-4000-8000-000000000003";
const COST_CATEGORY_ID = "20000000-0000-4000-8000-000000000004";

const auth = {
  tenantId: TENANT_ID,
  employeeId: EMPLOYEE_ID,
  permissions: [{ code: "supplier.catalog.manage", scope: "all" }],
} as AuthContext;

async function setup(existingVersion: number | null = null) {
  const { SupplierCostCategoryRulesService } = await import(
    "./supplier-cost-category-rules"
  );
  const repository = {
    listCostCategories: mock(async () => ({ list: [], pagination: {} })),
    listRules: mock(async () => ({ list: [], pagination: {} })),
    findActiveCostCategory: mock(async (): Promise<{ id: string } | null> => ({
      id: COST_CATEGORY_ID,
    })),
    findVisibleCategory: mock(async (): Promise<{ id: string } | null> => ({
      id: TARGET_ID,
    })),
    findVisibleProduct: mock(async (): Promise<{ id: string } | null> => ({
      id: TARGET_ID,
    })),
    findRule: mock(async () => existingVersion === null
      ? null
      : { id: "rule-id", version: existingVersion }),
    saveRule: mock(async (input: unknown) => input),
    deleteRule: mock(async () => true),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock(() => "all"),
  };
  return {
    repository,
    service: new SupplierCostCategoryRulesService({
      repository: repository as never,
      accessPolicy: accessPolicy as never,
    }),
  };
}

describe("SupplierCostCategoryRulesService", () => {
  test("lists active cost category options under catalog management permission", async () => {
    const { service, repository } = await setup();
    await service.listCostCategoryOptions(auth, {
      page: 1,
      pageSize: 20,
      keyword: "主材",
    });
    expect(repository.listCostCategories).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      keyword: "主材",
    });
  });

  test("creates a category rule at expected version zero", async () => {
    const { service, repository } = await setup();
    await service.saveRule(auth, "category", TARGET_ID, {
      cost_category_id: COST_CATEGORY_ID,
      expected_version: 0,
    });
    expect(repository.findVisibleCategory).toHaveBeenCalledWith(
      TENANT_ID,
      TARGET_ID,
    );
    expect(repository.saveRule).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      scope: "category",
      targetId: TARGET_ID,
      costCategoryId: COST_CATEGORY_ID,
      currentRuleId: null,
      expectedVersion: 0,
    });
  });

  test("supports product override but rejects stale versions", async () => {
    const { service, repository } = await setup(3);
    await expect(service.saveRule(auth, "product", TARGET_ID, {
      cost_category_id: COST_CATEGORY_ID,
      expected_version: 2,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_COST_CATEGORY_RULE_VERSION_CONFLICT",
    });
    expect(repository.findVisibleProduct).toHaveBeenCalledWith(
      TENANT_ID,
      TARGET_ID,
    );
    expect(repository.saveRule).not.toHaveBeenCalled();
  });

  test("rejects missing targets and inactive cost categories", async () => {
    const { service, repository } = await setup();
    repository.findVisibleCategory.mockImplementation(async () => null);
    await expect(service.saveRule(auth, "category", TARGET_ID, {
      cost_category_id: COST_CATEGORY_ID,
      expected_version: 0,
    })).rejects.toMatchObject({ statusCode: 404 });

    repository.findVisibleCategory.mockImplementation(async () => ({ id: TARGET_ID }));
    repository.findActiveCostCategory.mockImplementation(async () => null);
    await expect(service.saveRule(auth, "category", TARGET_ID, {
      cost_category_id: COST_CATEGORY_ID,
      expected_version: 0,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "SUPPLIER_COST_CATEGORY_INVALID",
    });
  });
});
