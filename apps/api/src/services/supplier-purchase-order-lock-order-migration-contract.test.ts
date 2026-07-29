import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260729192000_fix_supplier_purchase_order_lock_order.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

describe("supplier purchase order lock-order migration contract", () => {
  test("uses command, order-id, then row lock order for draft saves", () => {
    const commandLock = migration.indexOf("'supplier-command:'");
    const orderIdLock = migration.indexOf("'supplier-purchase-order-id:'");
    const rowLock = migration.indexOf("FOR UPDATE");

    expect(commandLock).toBeGreaterThan(-1);
    expect(commandLock).toBeLessThan(orderIdLock);
    expect(orderIdLock).toBeLessThan(rowLock);
  });

  test("validates and authorizes before taking advisory locks", () => {
    const validation = migration.indexOf("IF p_order_id IS NULL");
    const actor = migration.indexOf(
      "PERFORM public.assert_supplier_purchase_order_actor",
    );
    const commandLock = migration.indexOf("'supplier-command:'");

    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(actor);
    expect(actor).toBeLessThan(commandLock);
  });

  test("keeps the forward-only rollback boundary", () => {
    expect(migration).toContain("Rollback strategy");
    expect(migration).toContain("preserve submitted");
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
