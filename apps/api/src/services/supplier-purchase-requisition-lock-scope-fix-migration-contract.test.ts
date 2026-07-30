import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const migrationRoot = new URL("../../../../supabase/migrations/", import.meta.url);
const foundationPath = new URL(
  "20260730150000_create_supplier_purchase_requisitions.sql",
  migrationRoot,
);
const ordinalityFixPath = new URL(
  "20260730160000_fix_supplier_purchase_requisition_draft_ordinality.sql",
  migrationRoot,
);
const lockScopeFixPath = new URL(
  "20260730170000_fix_supplier_purchase_requisition_draft_lock_scope.sql",
  migrationRoot,
);
const lockScopeFixSql = existsSync(lockScopeFixPath)
  ? readFileSync(lockScopeFixPath, "utf8")
  : "";

describe("supplier purchase requisition draft lock scope fix migration", () => {
  test("keeps applied migrations immutable and removes only the draft category row lock", () => {
    expect(createHash("sha256").update(readFileSync(foundationPath)).digest("hex"))
      .toBe("f7c5c27404b9ab61e926cfc8cbc453eb87aed16e038e30f611ab166080804002");
    expect(createHash("sha256").update(readFileSync(ordinalityFixPath)).digest("hex"))
      .toBe("440edf79229a528c42538b58a76c5f03c3b08f675fecbd15c9a4dc07252b5e4f");
    expect(existsSync(lockScopeFixPath)).toBe(true);
    expect(lockScopeFixSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(lockScopeFixSql.match(
      /CREATE OR REPLACE FUNCTION public\.save_supplier_purchase_requisition_draft/g,
    )).toHaveLength(1);
    expect(lockScopeFixSql).toContain(
      "catalog_category, purchase_unit, base_unit, finance_category",
    );
    expect(lockScopeFixSql).toContain(
      "catalog_category, purchase_unit, base_unit",
    );
    expect(lockScopeFixSql).not.toMatch(
      /\b(?:CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM)\b/,
    );
    expect(lockScopeFixSql).toMatch(
      /forward migration[\s\S]*do not restore[\s\S]*draft category row lock/i,
    );
  });
});
