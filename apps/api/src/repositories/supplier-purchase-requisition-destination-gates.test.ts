import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = "20000000-0000-4000-8000-000000000001";
const TENANT_ID = "20000000-0000-4000-8000-000000000002";
const PROJECT_ID = "20000000-0000-4000-8000-000000000003";
const TENANT_SUPPLIER_ID = "20000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "20000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000006";
const WAREHOUSE_ID = "20000000-0000-4000-8000-000000000017";
const AT = "2026-07-30T02:00:00.000Z";

describe("supplier purchase requisition destination gates", () => {
  test("list reads remain limited to project procurement in Stage A", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return query;
      },
      in: () => query,
      or: () => query,
      order: () => query,
      range: async () => ({ data: [], error: null, count: 0 }),
      limit: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const { SupplierPurchaseRequisitionsRepository } = await import(
      "./supplier-purchase-requisitions"
    );
    const repository = new SupplierPurchaseRequisitionsRepository(
      () => ({
        from: () => query,
        rpc: async () => ({ data: null, error: null }),
      }) as never,
    );

    await repository.listRequisitions({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    });

    expect(eqCalls).toContainEqual(["destination_type", "project"]);
  });

  test("detail reads reject warehouse procurement before loading budgets", async () => {
    let fromCalls = 0;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null, count: 0 }),
      maybeSingle: async () => ({ data: warehouseRequisition, error: null }),
    };
    const { SupplierPurchaseRequisitionsRepository } = await import(
      "./supplier-purchase-requisitions"
    );
    const repository = new SupplierPurchaseRequisitionsRepository(
      () => ({
        from: () => {
          fromCalls += 1;
          return query;
        },
        rpc: async () => ({ data: null, error: null }),
      }) as never,
    );

    await expect(repository.findRequisition(TENANT_ID, ID))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "WAREHOUSE_PROCUREMENT_NOT_ENABLED",
      });
    expect(fromCalls).toBe(1);
  });

  test("scope reads reject warehouse procurement before project authorization", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      maybeSingle: async () => ({
        data: {
          id: ID,
          project_id: null,
          destination_type: "warehouse",
          warehouse_id: WAREHOUSE_ID,
          tenant_supplier_id: TENANT_SUPPLIER_ID,
          created_by_employee_id: EMPLOYEE_ID,
          budget_status: "over_budget",
          status: "pending_approval",
          version: 2,
        },
        error: null,
      }),
    };
    const { SupplierPurchaseRequisitionsRepository } = await import(
      "./supplier-purchase-requisitions"
    );
    const repository = new SupplierPurchaseRequisitionsRepository(
      () => ({
        from: () => query,
        rpc: async () => ({ data: null, error: null }),
      }) as never,
    );

    await expect(repository.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: ID,
      visible_project_ids: null,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WAREHOUSE_PROCUREMENT_NOT_ENABLED",
    });
  });
});

const warehouseRequisition = {
  id: ID,
  tenant_id: TENANT_ID,
  request_no: "PR-20260730-00000001",
  project_id: null,
  destination_type: "warehouse",
  warehouse_id: WAREHOUSE_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  status: "pending_approval",
  budget_status: "over_budget",
  currency: "CNY",
  reason: "仓库补货",
  expected_delivery_date: "2026-08-15",
  remark: null,
  priced_at: AT,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_order_id: null,
  purchase_batch_id: null,
  split_generation: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID,
  submitted_at: AT,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
  project: null,
  warehouse: { id: WAREHOUSE_ID, name: "中心仓", status: "active" },
} as const;
