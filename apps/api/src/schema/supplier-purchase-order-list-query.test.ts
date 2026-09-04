import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_FILTER_VALUES,
  SupplierPurchaseOrderListQuerySchema,
} from "./supplier-purchase-orders";

describe("SupplierPurchaseOrderListQuerySchema fulfillment filters", () => {
  test("accepts fulfillment status filters for purchase order list", () => {
    for (const fulfillmentStatus of
      SUPPLIER_PURCHASE_ORDER_FULFILLMENT_FILTER_VALUES) {
      expect(SupplierPurchaseOrderListQuerySchema.parse({
        fulfillmentStatus,
      }).fulfillmentStatus).toBe(fulfillmentStatus);
    }
  });

  test("rejects unknown fulfillment status filters", () => {
    expect(SupplierPurchaseOrderListQuerySchema.safeParse({
      fulfillmentStatus: "delivered",
    }).success).toBe(false);
  });
});
