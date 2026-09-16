import { describe, expect, test } from "bun:test";

import { SupplierPurchaseOrderReceiptCreateSchema } from
  "./supplier-purchase-orders";

const fileId = "30000000-0000-4000-8000-000000000008";
const input = (fileIds: string[]) => ({
  id: "30000000-0000-4000-8000-000000000007",
  expected_fulfillment_version: 2,
  receipt_no: "RCV-001",
  received_at: "2026-07-30T04:00:00.000Z",
  delivery_note_file_ids: fileIds,
  items: [{
    purchase_order_item_id: "30000000-0000-4000-8000-000000000004",
    accepted_quantity: 1,
    rejected_quantity: 0,
  }],
});

describe("supplier purchase receipt attachments", () => {
  test("accepts at most three unique delivery note files", () => {
    expect(SupplierPurchaseOrderReceiptCreateSchema.parse(input([fileId]))
      .delivery_note_file_ids).toEqual([fileId]);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(input(
      Array.from({ length: 4 }, (_, index) =>
        `30000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`),
    )).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(
      input([fileId, fileId]),
    ).success).toBe(false);
  });
});
