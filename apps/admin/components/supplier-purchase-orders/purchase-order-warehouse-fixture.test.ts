import { expect, test } from "bun:test";
import {
  warehouseOptions,
  warehouseOrderReferences,
} from "../../e2e/supplier-purchase-order-warehouse-fixture.mjs";

const order = {
  warehouse_id: warehouseOptions[24].id,
  purchase_requisition_id: "44000000-0000-4000-8000-000000000100",
};

test("warehouse order fixture matches the strict API destination relation", () => {
  // ProcurementDestinationRelationSchema: strict id/name/status, not WarehouseRecord.
  expect(warehouseOrderReferences(order).warehouse).toEqual({
    id: order.warehouse_id,
    name: "备货仓25",
    status: "inactive",
  });
});

test("warehouse order fixture uses the API procurement request number contract", () => {
  const relation = warehouseOrderReferences(order).purchase_requisition;
  expect(Object.keys(relation).sort()).toEqual([
    "budget_status",
    "id",
    "request_no",
    "status",
  ]);
  expect(relation.id).toBe(order.purchase_requisition_id);
  expect(relation.request_no).toMatch(/^PR-\d{8}-\d{8}$/);
});
