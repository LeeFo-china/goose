import { ids, now, session } from "./supplier-purchase-order-mock-fixture.mjs";

export const warehouseOptions = Array.from({ length: 25 }, (_, index) => ({
  id: `44000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  tenant_id: ids.tenant,
  warehouse_code: `WH-${index + 1}`,
  name: `备货仓${String(index + 1).padStart(2, "0")}`,
  address: null,
  contact_name: null,
  contact_phone: null,
  manager_employee_id: null,
  is_default: false,
  status: index === 24 ? "inactive" : "active",
  version: 1,
  created_at: now,
  updated_at: now,
}));

export function warehouseSession(role) {
  const permissions = ["supplier.view", "supplier.purchase-order.view"];
  if (role !== "warehouse-no-read") {
    permissions.push("inventory.warehouse.view");
  }
  if (role === "warehouse-manager" || role === "warehouse-order-manager") {
    permissions.push("supplier.purchase-order.manage");
  }
  if (role === "warehouse-manager" || role === "warehouse-only-manager") {
    permissions.push("inventory.warehouse.manage");
  }
  return {
    ...structuredClone(session),
    roles: ["employee"],
    permissions: permissions.map((code) => ({ code, scope: "all" })),
    token: `${role}-token`,
  };
}

export function warehouseOrderReferences(order) {
  const warehouse = warehouseOptions.find((warehouse) =>
    warehouse.id === order.warehouse_id
  );
  return {
    warehouse: warehouse
      ? { id: warehouse.id, name: warehouse.name, status: warehouse.status }
      : null,
    purchase_requisition: {
      id: order.purchase_requisition_id,
      request_no: "PR-20260907-00000001",
      status: "converted",
      budget_status: "not_applicable",
    },
  };
}

export function seedWarehouse(state, scenario) {
  const warehouse =
    warehouseOptions[scenario === "warehouse-gate-off" ? 24 : 0];
  state.order = {
    ...state.order,
    destination_type: "warehouse",
    warehouse_id: warehouse.id,
    project_id: null,
    order_no: "PO-WAREHOUSE-0001",
    status: "submitted",
    purchase_requisition_id: "44000000-0000-4000-8000-000000000100",
    submitted_by_employee_id: ids.employee,
    submitted_at: now,
  };
  if (scenario === "warehouse-paged" || scenario === "warehouse-refresh-race") {
    state.items = Array.from(
      { length: scenario === "warehouse-refresh-race" ? 201 : 101 },
      (_, index) => ({
        ...state.items[0],
        id: `45000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        supplier_sku_id: `46000000-0000-4000-8000-${
          String(index + 1).padStart(12, "0")
        }`,
        line_no: index + 1,
        product_name_snapshot: `分页商品${index + 1}`,
        sku_name_snapshot: `分页规格${index + 1}`,
      }),
    );
    for (const field of ["subtotal_amount", "tax_amount", "total_amount"]) {
      state.order[field] = (Number(state.items[0][field]) * state.items.length)
        .toFixed(2);
    }
  }
}
