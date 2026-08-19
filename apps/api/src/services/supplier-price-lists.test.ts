import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_SUPPLIER_ID = "70000000-0000-4000-8000-000000000001";
const TENANT_ID = "70000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "70000000-0000-4000-8000-000000000003";
const USER_ID = "70000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "70000000-0000-4000-8000-000000000005";
const PRICE_LIST_ID = "70000000-0000-4000-8000-000000000006";
const ITEM_ID = "70000000-0000-4000-8000-000000000007";
const SKU_ID = "70000000-0000-4000-8000-000000000008";
const TENANT_SKU_ID = "70000000-0000-4000-8000-000000000009";

function dependencies() {
  return {
    access: {
      requirePriceRead: mock(async () => scope),
      requirePriceWrite: mock(async () => scope),
    },
    repository: {
      listPriceLists: mock(async () => page),
      findPriceList: mock(async () => ({ id: PRICE_LIST_ID })),
      listItems: mock(async () => page),
      create: mock(async () => ({ status: "created" })),
      updateDraft: mock(async (input: unknown) => input),
      upsertItem: mock(async () => ({ status: "updated" })),
      deleteItem: mock(async () => ({ status: "deleted" })),
      publish: mock(async () => ({ status: "published" })),
      createVersion: mock(async () => ({ status: "created" })),
      retire: mock(async () => ({ status: "retired" })),
    },
  };
}

describe("SupplierPriceListsService", () => {
  test("publishes with a server-derived tenant price scope", async () => {
    const deps = dependencies();
    const { SupplierPriceListsService } = await import(
      "./supplier-price-lists"
    );
    const service = new SupplierPriceListsService(deps as never);

    await service.publish(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      {
        expected_version: 2,
      },
      "price:publish",
    );

    expect(deps.repository.publish).toHaveBeenCalledWith({
      price_list_id: PRICE_LIST_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      expected_version: 2,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:publish",
    });
  });

  test("maps platform and tenant SKUs to the same tenant price context", async () => {
    const deps = dependencies();
    const { SupplierPriceListsService } = await import(
      "./supplier-price-lists"
    );
    const service = new SupplierPriceListsService(deps as never);

    await service.upsertItem(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      ITEM_ID,
      {
        supplier_sku_id: SKU_ID,
        minimum_quantity: 1,
        maximum_quantity: null,
        unit_price: 88,
        tax_rate: 0.13,
        tax_inclusive: true,
        expected_version: 3,
      },
      "price:item:upsert",
    );
    await service.upsertItem(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      ITEM_ID,
      {
        supplier_sku_id: TENANT_SKU_ID,
        minimum_quantity: 1,
        maximum_quantity: null,
        unit_price: 99,
        tax_rate: 0.13,
        tax_inclusive: true,
        expected_version: 4,
      },
      "price:item:tenant-sku",
    );

    expect(deps.repository.upsertItem).toHaveBeenNthCalledWith(1, {
      item_id: ITEM_ID,
      price_list_id: PRICE_LIST_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      sku_id: SKU_ID,
      unit_price: 88,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 3,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:item:upsert",
    });
    expect(deps.repository.upsertItem).toHaveBeenNthCalledWith(2, {
      item_id: ITEM_ID,
      price_list_id: PRICE_LIST_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      sku_id: TENANT_SKU_ID,
      unit_price: 99,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 4,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:item:tenant-sku",
    });
  });

  test("requires cost-price read access before listing", async () => {
    const deps = dependencies();
    const { SupplierPriceListsService } = await import(
      "./supplier-price-lists"
    );
    const service = new SupplierPriceListsService(deps as never);

    await service.listPriceLists({} as never, {
      tenantSupplierId: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(deps.access.requirePriceRead).toHaveBeenCalledTimes(1);
    expect(deps.repository.listPriceLists).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("passes the trusted tenant to price details, items, and draft updates", async () => {
    const deps = dependencies();
    const { SupplierPriceListsService } = await import(
      "./supplier-price-lists"
    );
    const service = new SupplierPriceListsService(deps as never);

    await service.getPriceList(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
    );
    await service.listItems(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      { page: 1, pageSize: 20 },
    );
    await service.updateDraft(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      {
        expected_version: 1,
        name: "租户报价",
      },
      "price:update",
    );

    expect(deps.repository.findPriceList).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      price_list_id: PRICE_LIST_ID,
    });
    expect(deps.repository.listItems).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      price_list_id: PRICE_LIST_ID,
      page: 1,
      pageSize: 20,
    });
    expect(deps.repository.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: SUPPLIER_ID,
        tenant_id: TENANT_ID,
        tenant_supplier_id: TENANT_SUPPLIER_ID,
        price_list_id: PRICE_LIST_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "price:update",
      }),
    );
    const updateCommand = deps.repository.updateDraft.mock.calls[0]![0];
    expect(updateCommand).not.toHaveProperty("operation_source");
    expect(updateCommand).not.toHaveProperty("proxy_reason");
  });
});

const scope = {
  tenantId: TENANT_ID,
  tenantSupplierId: TENANT_SUPPLIER_ID,
  supplierId: SUPPLIER_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
};
const page = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
