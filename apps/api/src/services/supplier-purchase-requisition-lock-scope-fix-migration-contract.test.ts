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
const submitLockFixPath = new URL(
  "20260730180000_fix_supplier_purchase_requisition_submit_category_lock.sql",
  migrationRoot,
);
const submitLockFixSql = existsSync(submitLockFixPath)
  ? readFileSync(submitLockFixPath, "utf8")
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

  test("keeps the applied lock fix immutable and uses a key-compatible submit lock", () => {
    expect(createHash("sha256").update(readFileSync(lockScopeFixPath)).digest("hex"))
      .toBe("6a2f90581b939964cc7e53e51e31bf8fb662a9c60d292a7464384d704c6d55f9");
    expect(existsSync(submitLockFixPath)).toBe(true);
    expect(submitLockFixSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(submitLockFixSql.match(
      /CREATE OR REPLACE FUNCTION public\.submit_supplier_purchase_requisition/g,
    )).toHaveLength(1);
    expect(submitLockFixSql).toContain("FOR UPDATE OF finance_category");
    expect(submitLockFixSql).toContain(
      "FOR NO KEY UPDATE OF finance_category",
    );
    expect(submitLockFixSql).not.toMatch(
      /^\s*(?:CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE public\.|DELETE FROM)\b/m,
    );
    expect(submitLockFixSql).toMatch(
      /forward migration[\s\S]*do not restore[\s\S]*exclusive category row lock/i,
    );
  });
});
