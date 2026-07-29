import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260729191000_fix_supplier_purchase_order_transitions.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("supplier purchase order transition fix migration contract", () => {
  test("validates the wrapper input before actor and advisory locks", () => {
    const validation = migration.indexOf("IF p_order_id IS NULL");
    const actor = migration.indexOf(
      "PERFORM public.assert_supplier_purchase_order_actor",
    );
    const lock = migration.indexOf("'supplier-purchase-order-id:'");

    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(actor);
    expect(actor).toBeLessThan(lock);
  });

  test("permits controlled draft cancellation and increments every version", () => {
    expect(migration).toContain(
      "NEW.status NOT IN ('draft', 'submitted', 'cancelled')",
    );
    expect(migration).toContain("NEW.version <> OLD.version + 1");
    expect(migration).toContain("NEW.status = 'cancelled'");
    expect(migration).toContain("NEW.cancelled_by_employee_id IS NULL");
  });

  test("prevents commercial facts changing during submit or cancel", () => {
    expect(migration).toMatch(
      /NEW\.status IN \('submitted', 'cancelled'\)[\s\S]+NEW\.priced_at IS DISTINCT FROM OLD\.priced_at/,
    );
    expect(migration).toContain(
      "NEW.total_amount IS DISTINCT FROM OLD.total_amount",
    );
  });

  test("keeps the forward-only rollback boundary", () => {
    expect(migration).toContain("Rollback strategy");
    expect(migration).toContain("preserve submitted");
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
