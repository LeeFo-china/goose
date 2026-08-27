import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "51000000-0000-4000-8000-000000000001";
const ORDER_ID = "51000000-0000-4000-8000-000000000002";

async function repositoryFor(data: unknown) {
  const result = { data, error: null };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  const client = { from: () => query };
  const { SupplierPurchaseOrdersRepository } = await import(
    "./supplier-purchase-orders"
  );
  return new SupplierPurchaseOrdersRepository(() => client as never);
}

describe("supplier purchase order source projection", () => {
  test("accepts a legacy order with explicit null source fields", async () => {
    const repository = await repositoryFor(legacyOrder);

    await expect(repository.findOrder(TENANT_ID, ORDER_ID)).resolves
      .toMatchObject({
        purchase_requisition_id: null,
        purchase_requisition: null,
      });
  });

  test.each([
    "purchase_requisition_id",
    "purchase_requisition",
    "purchase_batch_id",
  ] as const)("rejects a missing %s field with DB_ERROR", async (field) => {
    const malformed = Object.fromEntries(
      Object.entries(legacyOrder).filter(([key]) => key !== field),
    );
    const repository = await repositoryFor(malformed);

    await expect(repository.findOrder(TENANT_ID, ORDER_ID))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});

const legacyOrder = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  project_id: "51000000-0000-4000-8000-000000000003",
  tenant_supplier_id: "51000000-0000-4000-8000-000000000004",
  supplier_id: "51000000-0000-4000-8000-000000000005",
  order_no: "PO-20260730-00000001",
  status: "draft",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: "2026-07-30T08:00:00.000Z",
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_requisition_id: null,
  purchase_batch_id: null,
  version: 1,
  created_by_employee_id: "51000000-0000-4000-8000-000000000006",
  updated_by_employee_id: "51000000-0000-4000-8000-000000000006",
  submitted_by_employee_id: null,
  submitted_at: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: "2026-07-30T08:00:00.000Z",
  updated_at: "2026-07-30T08:00:00.000Z",
  project: {
    id: "51000000-0000-4000-8000-000000000003",
    name: "历史项目",
    status: "active",
  },
  supplier: {
    id: "51000000-0000-4000-8000-000000000005",
    code: "SUP-LEGACY",
    name: "历史供应商",
    legal_name: "历史供应商有限公司",
    onboarding_status: "approved",
    operational_status: "active",
  },
  purchase_requisition: null,
} as const;
