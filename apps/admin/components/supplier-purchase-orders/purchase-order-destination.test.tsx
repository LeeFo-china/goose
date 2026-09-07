import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrderList } from "./purchase-order-list";
import {
  canEditPurchaseOrderDraft,
  purchaseOrderActions,
} from "./purchase-order-rules";
import type { PurchaseOrderWithReferences } from "./purchase-order-types";

// Exact warehouse wire shape, including its deliberately null project reference.
const warehouseOrder = {
  id: "77000000-0000-4000-8000-000000000001",
  tenant_id: "77000000-0000-4000-8000-000000000002",
  destination_type: "warehouse",
  project_id: null,
  warehouse_id: "77000000-0000-4000-8000-000000000003",
  tenant_supplier_id: "77000000-0000-4000-8000-000000000004",
  supplier_id: "77000000-0000-4000-8000-000000000005",
  order_no: "CG-WH-0001",
  status: "submitted",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: "2026-09-07T01:00:00Z",
  subtotal_amount: "100.00",
  tax_amount: "0.00",
  total_amount: "100.00",
  purchase_requisition_id: "77000000-0000-4000-8000-000000000006",
  version: 1,
  created_by_employee_id: "77000000-0000-4000-8000-000000000007",
  updated_by_employee_id: "77000000-0000-4000-8000-000000000007",
  submitted_by_employee_id: null,
  submitted_at: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: "2026-09-07T01:00:00Z",
  updated_at: "2026-09-07T01:00:00Z",
  fulfillment_status: "unconfirmed",
  project: null,
  warehouse: {
    id: "77000000-0000-4000-8000-000000000003",
    name: "中心备货仓",
    status: "inactive",
  },
  supplier: {
    id: "77000000-0000-4000-8000-000000000005",
    code: "SUP",
    name: "建材供应商",
    legal_name: "建材供应商",
    onboarding_status: "approved",
    operational_status: "active",
  },
  purchase_requisition: {
    id: "77000000-0000-4000-8000-000000000006",
    request_no: "PR-20260907-00000001",
    status: "converted",
    budget_status: "not_applicable",
  },
} satisfies PurchaseOrderWithReferences;

test("warehouse order with null project renders its real destination without crashing", () => {
  const markup = renderToStaticMarkup(
    <PurchaseOrderList
      orders={[warehouseOrder]}
      loading={false}
      canManage
      onOpen={() => undefined}
      onEdit={() => undefined}
    />,
  );
  expect(markup).toContain("采购去向");
  expect(markup).toContain("中心备货仓");
  expect(markup).toContain("仓库");
  expect(markup).not.toContain(
    warehouseOrder.warehouse_id ?? "warehouse-private-id",
  );
});

test("warehouse drafts never enter the legacy project editor", () => {
  expect(
    canEditPurchaseOrderDraft({ ...warehouseOrder, status: "draft" }, true),
  ).toBe(false);
});

test("warehouse actions require original order manage plus warehouse manage", () => {
  expect(purchaseOrderActions("submitted", true, "warehouse", false)).toEqual(
    [],
  );
  expect(purchaseOrderActions("submitted", false, "warehouse", true)).toEqual(
    [],
  );
  expect(purchaseOrderActions("submitted", true, "warehouse", true)).toEqual([
    "cancel",
  ]);
  expect(purchaseOrderActions("draft", true, "warehouse", true)).toEqual([]);
  expect(purchaseOrderActions("draft", true)).toEqual([
    "edit",
    "submit",
    "cancel",
  ]);
});
