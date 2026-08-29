import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260829130000_clarify_supplier_product_active_sku_requirement.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("supplier product active SKU requirement migration", () => {
  test("replaces the product catalog validator with a specific activation error", () => {
    const normalized = compact(sql);

    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(normalized).toContain(
      "CREATE OR REPLACE FUNCTION public.validate_supplier_product_catalog()",
    );
    expect(normalized).toContain(
      "IF NEW.status = 'active' AND NOT EXISTS ( SELECT 1 FROM public.supplier_skus AS sku",
    );
    expect(normalized).toContain(
      "MESSAGE = 'SUPPLIER_PRODUCT_ACTIVE_SKU_REQUIRED'",
    );
    expect(normalized).not.toContain(
      "MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT'",
    );
  });
});
