import { expect, test } from "bun:test";
import { SupplierPurchaseBatchCatalogQuerySchema, SupplierPurchaseBatchDraftSchema } from "./supplier-purchase-batches";

const id = "20000000-0000-4000-8000-000000000001";
const draft = { expected_version: 0, reason: "补货", items: [{ supplier_sku_id: id, quantity: "2" }] };

test("legacy project drafts retain compatibility", () => {
  expect(SupplierPurchaseBatchDraftSchema.parse({ ...draft, project_id: id }).project_id).toBe(id);
});

test("warehouse drafts and catalog accept warehouse without project", () => {
  expect(SupplierPurchaseBatchDraftSchema.safeParse({ ...draft, destination_type: "warehouse", project_id: null, warehouse_id: id }).success).toBe(true);
  expect(SupplierPurchaseBatchCatalogQuerySchema.safeParse({ destinationType: "warehouse", warehouseId: id }).success).toBe(true);
});

test("destination requires its exclusive identifier", () => {
  for (const destination of [
    { destination_type: "warehouse", project_id: id, warehouse_id: id },
    { destination_type: "warehouse", project_id: null },
    { destination_type: "project", project_id: null, warehouse_id: id },
    { project_id: id, warehouse_id: id },
  ]) expect(SupplierPurchaseBatchDraftSchema.safeParse({ ...draft, ...destination }).success).toBe(false);
});
