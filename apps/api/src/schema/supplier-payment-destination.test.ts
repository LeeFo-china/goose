import { expect, test } from "bun:test";
import { SupplierPaymentRequestDraftSchema, SupplierPayableListQuerySchema, SupplierPayableFilterOptionQuerySchema, SupplierPaymentRequestListQuerySchema } from "./supplier-payments";

const id = "84000000-0000-4000-8000-000000000001";
const draft = { id, project_id: id, tenant_supplier_id: id, expected_version: 0, reason: "材料款",
  allocations: [{ payable_event_id: id, requested_amount: "10.00" }] };

test("legacy project and explicit warehouse settlement drafts have exclusive destinations", () => {
  expect(SupplierPaymentRequestDraftSchema.safeParse(draft).success).toBe(true);
  expect(SupplierPaymentRequestDraftSchema.safeParse({ ...draft, destination_type: "warehouse", project_id: null, warehouse_id: id }).success).toBe(true);
  for (const fields of [
    { destination_type: "warehouse", project_id: id, warehouse_id: id },
    { destination_type: "warehouse", project_id: null },
    { destination_type: "project", project_id: null, warehouse_id: id },
    { project_id: id, warehouse_id: id },
  ]) expect(SupplierPaymentRequestDraftSchema.safeParse({ ...draft, ...fields }).success).toBe(false);
});

test("financial lists and options accept bounded warehouse filters", () => {
  for (const schema of [SupplierPayableListQuerySchema, SupplierPaymentRequestListQuerySchema]) {
    expect(schema.safeParse({ destination_type: "warehouse", warehouse_id: id, page: 1, pageSize: 100 }).success).toBe(true);
    expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
  }
  expect(SupplierPayableFilterOptionQuerySchema.safeParse({ type: "warehouse", destination_type: "warehouse" }).success).toBe(true);
});
