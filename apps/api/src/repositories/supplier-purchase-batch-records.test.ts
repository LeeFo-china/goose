import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_BATCH_SELECT,
  SupplierPurchaseBatchCatalogItemSchema,
  SupplierPurchaseBatchDetailSchema,
  SupplierPurchaseBatchOrderSchema,
} from "./supplier-purchase-batch-records";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const BATCH_ID = "10000000-0000-4000-8000-000000000001";
const TENANT_ID = "10000000-0000-4000-8000-000000000002";
const PROJECT_ID = "10000000-0000-4000-8000-000000000003";
const WAREHOUSE_ID = "10000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "10000000-0000-4000-8000-000000000005";
const TENANT_SUPPLIER_ID = "10000000-0000-4000-8000-000000000006";
const SUPPLIER_ID = "10000000-0000-4000-8000-000000000007";
const ORDER_ID = "10000000-0000-4000-8000-000000000008";
const REQUISITION_ID = "10000000-0000-4000-8000-000000000009";
const AT = "2026-09-05T12:00:00.000Z";

const CatalogNumbersSchema = SupplierPurchaseBatchCatalogItemSchema.pick({
  base_unit_conversion: true,
  unit_price: true,
  tax_rate: true,
});
describe("supplier purchase batch record numeric boundaries", () => {
  test("uses the exact batch catalog conversion, price, and tax domains", () => {
    expect(CatalogNumbersSchema.parse({
      base_unit_conversion: "9999999999.99999999",
      unit_price: "999999999999.99",
      tax_rate: "1.000000",
    })).toEqual({
      base_unit_conversion: "9999999999.99999999",
      unit_price: "999999999999.99",
      tax_rate: "1.000000",
    });

    for (const invalid of [
      { base_unit_conversion: "0", unit_price: "1.00", tax_rate: "0" },
      { base_unit_conversion: "1.000000001", unit_price: "1.00", tax_rate: "0" },
      { base_unit_conversion: "1", unit_price: "1.001", tax_rate: "0" },
      { base_unit_conversion: "1", unit_price: "1.00", tax_rate: "1.000001" },
    ]) {
      expect(CatalogNumbersSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("uses numeric eighteen scale two for batch child order totals", () => {
    expect(SupplierPurchaseBatchOrderSchema.parse({
      ...batchOrder,
      subtotal_amount: "9999999999999999.99",
      tax_amount: "0.00",
      total_amount: "9999999999999999.99",
    }).total_amount).toBe("9999999999999999.99");

    for (const field of [
      "subtotal_amount",
      "tax_amount",
      "total_amount",
    ] as const) {
      for (const value of ["1.001", "10000000000000000.00"]) {
        expect(SupplierPurchaseBatchOrderSchema.safeParse({
          ...batchOrder,
          subtotal_amount: "1.00",
          tax_amount: "1.00",
          total_amount: "2.00",
          [field]: value,
        }).success).toBe(false);
      }
    }
  });
});

describe("supplier purchase batch record selects", () => {
  test("uses the tenant-safe batch-project foreign key for project embedding", () => {
    expect(SUPPLIER_PURCHASE_BATCH_SELECT).toContain(
      "project:projects!supplier_purchase_batches_project_tenant_fkey" +
        "(id,name,status)",
    );
    expect(SUPPLIER_PURCHASE_BATCH_SELECT).not.toContain(
      "project:projects!project_id(",
    );
  });

  test("selects project and warehouse destination facts", () => {
    expect(SUPPLIER_PURCHASE_BATCH_SELECT).toContain("destination_type");
    expect(SUPPLIER_PURCHASE_BATCH_SELECT).toContain("warehouse_id");
    expect(SUPPLIER_PURCHASE_BATCH_SELECT).toContain(
      "warehouse:warehouses!supplier_purchase_batches_warehouse_tenant_fkey" +
        "(id,name,status)",
    );
  });
});

describe("supplier purchase batch destination records", () => {
  test("parses project and warehouse destinations with nullable relations", () => {
    expect(SupplierPurchaseBatchDetailSchema.parse(projectBatch))
      .toMatchObject({
        destination_type: "project",
        project_id: PROJECT_ID,
        warehouse_id: null,
        warehouse: null,
      });
    expect(SupplierPurchaseBatchDetailSchema.parse(warehouseBatch))
      .toMatchObject({
        destination_type: "warehouse",
        project_id: null,
        warehouse_id: WAREHOUSE_ID,
        project: null,
        warehouse: { id: WAREHOUSE_ID, name: "中心仓", status: "active" },
      });
  });

  test("rejects inconsistent destination ownership", () => {
    for (const invalid of [
      { ...projectBatch, project_id: null },
      { ...projectBatch, warehouse_id: WAREHOUSE_ID },
      { ...warehouseBatch, project_id: PROJECT_ID },
      { ...warehouseBatch, warehouse_id: null },
    ]) {
      expect(SupplierPurchaseBatchDetailSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("list reads remain limited to project procurement in Stage A", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return query;
      },
      gte: () => query,
      lte: () => query,
      lt: () => query,
      in: () => query,
      or: () => query,
      order: () => query,
      range: async () => ({ data: [], error: null, count: 0 }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const { SupplierPurchaseBatchesRepository } = await import(
      "./supplier-purchase-batches"
    );
    const repository = new SupplierPurchaseBatchesRepository(
      () => ({ from: () => query, rpc: async () => ({ data: null, error: null }) }) as never,
    );

    await repository.listBatches({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    });

    expect(eqCalls).toContainEqual(["destination_type", "project"]);
  });

  test("detail reads reject warehouse procurement before project gates", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: warehouseBatch, error: null }),
    };
    const { SupplierPurchaseBatchesRepository } = await import(
      "./supplier-purchase-batches"
    );
    const repository = new SupplierPurchaseBatchesRepository(
      () => ({ from: () => query, rpc: async () => ({ data: null, error: null }) }) as never,
    );

    await expect(repository.findBatch(TENANT_ID, BATCH_ID))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "WAREHOUSE_PROCUREMENT_NOT_ENABLED",
      });
  });
});

const batchBase = {
  id: BATCH_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  destination_type: "project",
  warehouse_id: null,
  batch_no: "PB-20260905-00000001",
  status: "draft",
  reason: "项目采购",
  expected_delivery_date: null,
  remark: null,
  priced_at: AT,
  currency: "CNY",
  subtotal_amount: "0.00",
  tax_amount: "0.00",
  total_amount: "0.00",
  budget_checked_at: null,
  budget_status: "unchecked",
  budget_snapshot: {},
  split_generation: 0,
  supplier_count: 0,
  item_count: 0,
  approval_round: 0,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
} as const;

const projectBatch = {
  ...batchBase,
  project: { id: PROJECT_ID, name: "示范项目", status: "active" },
  warehouse: null,
} as const;

const warehouseBatch = {
  ...batchBase,
  destination_type: "warehouse",
  project_id: null,
  warehouse_id: WAREHOUSE_ID,
  project: null,
  warehouse: { id: WAREHOUSE_ID, name: "中心仓", status: "active" },
} as const;

const batchOrder = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  destination_type: "project",
  warehouse_id: null,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  order_no: "PO-20260905-00000001",
  status: "draft",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: AT,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_requisition_id: REQUISITION_ID,
  purchase_batch_id: BATCH_ID,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
  project: { id: PROJECT_ID, name: "示范项目", status: "active" },
  warehouse: null,
  supplier: {
    id: SUPPLIER_ID,
    code: "SUP-001",
    name: "示范供应商",
    legal_name: "示范供应商有限公司",
    onboarding_status: "approved",
    operational_status: "active",
  },
  purchase_requisition: {
    id: REQUISITION_ID,
    request_no: "PR-20260905-00000001",
    status: "draft",
    budget_status: "unchecked",
  },
} as const;
