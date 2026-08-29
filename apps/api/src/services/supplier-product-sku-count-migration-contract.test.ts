import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260829150000_add_supplier_product_sku_counts.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const hardeningMigrationUrl = new URL(
  "../../../../supabase/migrations/20260829153000_harden_supplier_product_sku_count_batch_limit.sql",
  import.meta.url,
);
const hardeningSql = existsSync(hardeningMigrationUrl)
  ? readFileSync(hardeningMigrationUrl, "utf8")
  : "";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("supplier product SKU count migration", () => {
  test("adds a bounded ownership-scoped batch aggregate", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);

    const normalized = compact(sql);
    expect(normalized).toContain(
      "CREATE FUNCTION public.list_supplier_product_sku_counts( p_supplier_id uuid, p_product_ids uuid[], p_ownership_scope text, p_tenant_id uuid DEFAULT NULL )",
    );
    expect(normalized).toContain("COALESCE(array_length(p_product_ids, 1), 0) > 100");
    expect(normalized).toContain("sku.supplier_id = p_supplier_id");
    expect(normalized).toContain("sku.supplier_product_id = ANY(p_product_ids)");
    expect(normalized).toContain("sku.ownership_scope = p_ownership_scope");
    expect(normalized).toContain("sku.owner_tenant_id = p_tenant_id");
    expect(normalized).toContain(
      "COUNT(*) FILTER (WHERE sku.status = 'active')::integer AS active_sku_count",
    );
  });

  test("exposes the aggregate only to the API service role", () => {
    const normalized = compact(sql);
    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.list_supplier_product_sku_counts\( uuid, uuid\[\], text, uuid \) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_supplier_product_sku_counts\( uuid, uuid\[\], text, uuid \) TO service_role;/,
    );
  });

  test("hardens the batch limit against multidimensional arrays", () => {
    expect(existsSync(hardeningMigrationUrl)).toBe(true);
    expect(hardeningSql).toMatch(/^-- Rollback: forward-only\./);
    expect(compact(hardeningSql)).toContain(
      "COALESCE(cardinality(p_product_ids), 0) > 100",
    );
  });
});
