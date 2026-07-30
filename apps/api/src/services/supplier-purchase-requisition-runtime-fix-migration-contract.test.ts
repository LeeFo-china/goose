import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const appliedMigrationPath = new URL(
  "../../../../supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql",
  import.meta.url,
);
const runtimeFixMigrationPath = new URL(
  "../../../../supabase/migrations/20260730160000_fix_supplier_purchase_requisition_draft_ordinality.sql",
  import.meta.url,
);
const appliedSql = readFileSync(appliedMigrationPath, "utf8");
const runtimeFixSql = existsSync(runtimeFixMigrationPath)
  ? readFileSync(runtimeFixMigrationPath, "utf8")
  : "";

describe("supplier purchase requisition runtime fix migration", () => {
  test("keeps the applied foundation immutable and fixes draft ordinality forward", () => {
    expect(createHash("sha256").update(appliedSql).digest("hex")).toBe(
      "f7c5c27404b9ab61e926cfc8cbc453eb87aed16e038e30f611ab166080804002",
    );
    expect(existsSync(runtimeFixMigrationPath)).toBe(true);
    expect(runtimeFixSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(runtimeFixSql.match(
      /CREATE OR REPLACE FUNCTION public\.save_supplier_purchase_requisition_draft/g,
    )).toHaveLength(1);
    expect(runtimeFixSql).toMatch(
      /FROM ROWS FROM \(\s*jsonb_to_recordset\(p_items\) AS \(\s*supplier_sku_id uuid,\s*cost_category_id uuid,\s*quantity numeric\s*\)\s*\) WITH ORDINALITY AS item\(\s*supplier_sku_id,\s*cost_category_id,\s*quantity,\s*ordinality\s*\)/,
    );
    expect(runtimeFixSql).not.toMatch(
      /jsonb_to_recordset\(p_items\) WITH ORDINALITY AS item\(\s*supplier_sku_id uuid/,
    );
    expect(runtimeFixSql).not.toMatch(
      /\b(?:CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM)\b/,
    );
    expect(runtimeFixSql).toMatch(
      /forward migration[\s\S]*restore[\s\S]*runtime-invalid[\s\S]*corrected version/i,
    );
  });
});
