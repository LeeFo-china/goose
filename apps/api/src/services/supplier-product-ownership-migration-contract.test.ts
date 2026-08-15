import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function extractFunction(source: string, name: string) {
  return source.match(
    new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  )?.[0] ?? "";
}

describe("supplier product ownership migration contract", () => {
  test("is transactional and forward-only", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  test("adds structured spec values to SKUs", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_skus[\s\S]*?ADD COLUMN spec_values jsonb/,
    );
  });

  test("creates SKU unit conversion edges", () => {
    expect(sql).toMatch(/CREATE TABLE public\.supplier_sku_unit_conversions/);
  });

  test("adds explicit tenant ownership to price lists and items", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_lists[\s\S]*?ADD COLUMN tenant_id uuid/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_list_items[\s\S]*?ADD COLUMN tenant_id uuid/,
    );
  });

  test("replaces global product and SKU code uniqueness with scope-aware indexes", () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT supplier_products_supplier_code_key/,
    );
    expect(sql).toMatch(
      /DROP CONSTRAINT supplier_skus_supplier_code_key/,
    );
    expect(sql).toMatch(/supplier_products_platform_code_unique_idx/);
    expect(sql).toMatch(/supplier_products_tenant_code_unique_idx/);
    expect(sql).toMatch(/supplier_skus_platform_code_unique_idx/);
    expect(sql).toMatch(/supplier_skus_tenant_code_unique_idx/);
  });

  test("creates product and SKU ownership guard functions", () => {
    expect(extractFunction(sql, "guard_supplier_product_ownership")).not.toBe("");
    expect(extractFunction(sql, "guard_supplier_sku_ownership")).not.toBe("");
    expect(extractFunction(sql, "guard_supplier_price_tenant")).not.toBe("");
  });

  test("enforces RLS on product and price tables", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_products ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_skus ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_lists ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_price_list_items ENABLE ROW LEVEL SECURITY/,
    );
  });

  test("does not backfill unprovable ownership or force NOT NULL", () => {
    expect(sql).not.toMatch(
      /ALTER TABLE public\.supplier_products\s+ALTER COLUMN (ownership_scope|owner_tenant_id) SET NOT NULL/,
    );
    expect(sql).not.toMatch(
      /ALTER TABLE public\.supplier_skus\s+ALTER COLUMN (ownership_scope|owner_tenant_id) SET NOT NULL/,
    );
  });
});
