import { describe, expect, test } from "bun:test";

const ORDER_ID = "63000000-0000-4000-8000-000000000001";

describe("SupplierPurchaseOrderFinancialSummarySchema", () => {
  test("accepts the strict two-decimal money DTO", async () => {
    const schemas = await import("./supplier-purchase-orders");
    const schema = Reflect.get(
      schemas,
      "SupplierPurchaseOrderFinancialSummarySchema",
    ) as { safeParse(input: unknown): { success: boolean } } | undefined;

    expect(schema).toBeDefined();
    expect(schema?.safeParse(summary).success).toBe(true);
  });

  test("rejects malformed money, missing fields, and unknown fields", async () => {
    const schemas = await import("./supplier-purchase-orders");
    const schema = Reflect.get(
      schemas,
      "SupplierPurchaseOrderFinancialSummarySchema",
    ) as { safeParse(input: unknown): { success: boolean } } | undefined;

    expect(schema).toBeDefined();
    expect(schema?.safeParse({ ...summary, paid_amount: "20" }).success)
      .toBe(false);
    const { open_amount: _missing, ...missing } = summary;
    expect(schema?.safeParse(missing).success).toBe(false);
    expect(schema?.safeParse({ ...summary, extra: "no" }).success).toBe(false);
  });
});

const summary = {
  purchase_order_id: ORDER_ID,
  accepted_amount: "120.00",
  payable_amount: "120.00",
  reserved_request_amount: "30.00",
  paid_amount: "20.00",
  open_amount: "100.00",
  available_to_request_amount: "70.00",
};
