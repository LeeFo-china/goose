import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260905130000_align_supplier_purchase_order_awaiting_receipt.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function sqlFunction(schema: string, name: string) {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("supplier purchase order awaiting receipt migration contract", () => {
  test("classifies supplier-confirmed shares as awaiting receipt before pagination", () => {
    const fn = sqlFunction("public", "list_supplier_purchase_orders");

    expect(fn).toContain("public.supplier_purchase_order_share_links");
    expect(fn).toContain("share_link.confirmed_at IS NOT NULL");
    expect(fn).toContain("share_link.expires_at > now()");
    expect(fn).toMatch(
      /p_fulfillment_status = 'unconfirmed'[\s\S]*NOT COALESCE\(share_confirmation\.is_confirmed, false\)/,
    );
    expect(fn).toMatch(
      /p_fulfillment_status = 'awaiting_receipt'[\s\S]*fulfillment\.status IN \('confirmed', 'partially_shipped', 'shipped'\)[\s\S]*COALESCE\(share_confirmation\.is_confirmed, false\)/,
    );
    expect(fn).toMatch(
      /WITH filtered AS \([\s\S]*share_confirmation[\s\S]*\),\s*counted AS \(\s*SELECT count\(\*\) AS total FROM filtered\s*\),\s*paged AS \(/,
    );
  });

  test("allows receipt directly against confirmed orders without shipment facts", () => {
    const fn = sqlFunction("public", "create_supplier_purchase_order_receipt");

    expect(sql).toContain(
      "ALTER TABLE public.supplier_purchase_order_fulfillments",
    );
    expect(sql).toContain(
      "ALTER TABLE public.supplier_purchase_order_item_fulfillments",
    );
    expect(sql).toContain("received_quantity <= ordered_quantity");
    expect(fn).toContain("item_fulfillment.ordered_quantity");
    expect(fn).not.toContain("item_fulfillment.shipped_quantity\n    ), false)");
  });

  test("creates fulfillment facts from supplier share confirmation when missing", () => {
    const fn = sqlFunction(
      "public",
      "ensure_supplier_purchase_order_fulfillment_from_share_link",
    );

    expect(fn).toContain("public.supplier_purchase_order_share_links");
    expect(fn).toContain("public.employees AS employee");
    expect(fn).toContain("employee.user_id");
    expect(fn).toContain("public.confirm_supplier_purchase_order_fulfillment");
    expect(fn).toContain("'supplier-share-confirm:' || v_share_link.id::text");
    expect(fn).toMatch(
      /IF v_existing_fulfillment\.id IS NOT NULL THEN[\s\S]*'already_confirmed'/,
    );
  });
});
