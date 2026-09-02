import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260902180000_supplier_purchase_auto_cost_category.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("supplier purchase automatic cost category migration", () => {
  test("adds one bounded batch resolver without changing purchase snapshots", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    const normalized = compact(sql);
    expect(normalized).toContain(
      "CREATE FUNCTION public.resolve_tenant_supplier_sku_cost_categories(",
    );
    expect(normalized).toContain("COALESCE(cardinality(p_supplier_sku_ids), 0) NOT BETWEEN 1 AND 100");
    expect(normalized).toContain("sku.id = ANY(p_supplier_sku_ids)");
    expect(normalized).toContain(
      "CROSS JOIN LATERAL public.resolve_tenant_catalog_cost_category(",
    );
    expect(normalized).toContain("SELECT DISTINCT ON (sku.id)");
    expect(sql).not.toMatch(/UPDATE public\.supplier_purchase_batch_items/i);
    expect(sql).not.toMatch(/UPDATE public\.finance_ledger_entries/i);
  });

  test("exposes the resolver only to the API service role", () => {
    const normalized = compact(sql);
    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolve_tenant_supplier_sku_cost_categories\( uuid, uuid\[\] \) FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_tenant_supplier_sku_cost_categories\( uuid, uuid\[\] \) TO service_role/,
    );
  });
});
