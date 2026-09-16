import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260916133000_supplier_purchase_receipt_delivery_note_attachments.sql",
  import.meta.url,
);

describe("supplier purchase receipt delivery note migration", () => {
  test("binds private files atomically and preserves receipt idempotency", async () => {
    const sql = await Bun.file(migration).text();
    expect(sql).toContain("CREATE TABLE public.supplier_purchase_receipt_attachments");
    expect(sql).toContain("supplier_purchase_receipt_delivery_note");
    expect(sql).toContain("create_supplier_purchase_order_receipt_with_attachments");
    expect(sql).toContain("public.create_supplier_purchase_order_receipt(");
    expect(sql).toContain("SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_INVALID");
    expect(sql).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("cardinality(v_file_ids) > 3");
  });
});
