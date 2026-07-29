import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260729190000_harden_supplier_purchase_orders.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");

describe("supplier purchase order hardening migration contract", () => {
  test("locks order ids and hides cross-tenant versions before draft save", () => {
    expect(migration).toContain("supplier-purchase-order-id:");
    expect(migration).toMatch(
      /WHERE purchase_order\.id = p_order_id\s+AND purchase_order\.tenant_id = p_tenant_id/,
    );
    expect(migration).toContain(
      "'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT'",
    );
  });

  test("maps amount overflow to a stable validation envelope", () => {
    expect(migration).toContain("WHEN numeric_value_out_of_range THEN");
    expect(migration).toContain(
      "'SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED'",
    );
  });

  test("allows only controlled lifecycle transitions and immutable submitted items", () => {
    expect(migration).toContain("TG_OP = 'DELETE'");
    expect(migration).toContain("OLD.status = 'submitted'");
    expect(migration).toContain("NEW.status <> 'cancelled'");
    expect(migration).toMatch(
      /NEW\.supplier_purchase_order_id IS DISTINCT FROM\s+OLD\.supplier_purchase_order_id/,
    );
    expect(migration).toContain("v_old_order_status <> 'draft'");
  });

  test("exposes one paginated eligible supplier option command", () => {
    expect(migration).toContain(
      "list_supplier_purchase_order_supplier_options",
    );
    expect(migration).toContain("p_page_size integer DEFAULT 20");
    expect(migration).toContain("LEAST(GREATEST(p_page_size, 1), 100)");
    expect(migration).toContain("eligibility.eligible");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_supplier_purchase_order_supplier_options/,
    );
  });

  test("documents a forward rollback that keeps submitted facts", () => {
    expect(migration).toContain("Rollback strategy");
    expect(migration).toContain("preserve submitted");
    expect(migration).not.toMatch(
      /DROP TABLE\s+(?:IF EXISTS\s+)?public\.supplier_purchase_orders/i,
    );
  });
});
