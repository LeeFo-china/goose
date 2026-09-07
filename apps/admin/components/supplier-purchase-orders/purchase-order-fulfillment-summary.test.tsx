import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrderFulfillmentSummary } from "./purchase-order-fulfillment-summary";
import type { PurchaseOrderFulfillmentDetail } from "./purchase-order-fulfillment-types";

test("paginated purchase-item names never fall back to raw record identifiers", () => {
  const hiddenId = "77000000-0000-4000-8000-000000000099";
  const detail: PurchaseOrderFulfillmentDetail = {
    fulfillment: {
      id: "fulfillment",
      tenant_id: "tenant",
      supplier_purchase_order_id: "order",
      status: "confirmed",
      confirmed_at: "2026-09-07T01:00:00Z",
      confirmed_by_employee_id: "employee",
      confirmation_remark: null,
      version: 1,
      created_at: "2026-09-07T01:00:00Z",
      updated_at: "2026-09-07T01:00:00Z",
    },
    item_fulfillments: [{
      tenant_id: "tenant",
      supplier_purchase_order_fulfillment_id: "fulfillment",
      supplier_purchase_order_item_id: hiddenId,
      ordered_quantity: "1.0000",
      shipped_quantity: "0.0000",
      received_quantity: "0.0000",
      accepted_quantity: "0.0000",
      rejected_quantity: "0.0000",
      accepted_subtotal_amount: "0.00",
      accepted_tax_amount: "0.00",
      accepted_total_amount: "0.00",
      updated_at: "2026-09-07T01:00:00Z",
    }],
  };
  const empty = {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
  const markup = renderToStaticMarkup(
    <PurchaseOrderFulfillmentSummary
      detail={detail}
      shipments={empty}
      receipts={empty}
      purchaseOrderItems={[]}
      historyBusy={null}
      onLoadMoreShipments={() => undefined}
      onLoadMoreReceipts={() => undefined}
    />,
  );
  expect(markup).not.toContain(hiddenId);
  expect(markup).toContain("请加载采购明细查看商品名称");
});
