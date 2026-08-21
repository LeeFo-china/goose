import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationNames = [
  "20260819123000_index_catalog_category_leaf_queries.sql",
  "20260819123100_index_supplier_product_list_queries.sql",
  "20260819123200_index_supplier_sku_list_queries.sql",
  "20260819123300_index_supplier_price_list_queries.sql",
];
const migrations = migrationNames.map((name) => {
  const url = new URL(`../../../../supabase/migrations/${name}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
});
const sql = migrations.join("\n");
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("supplier product admin query indexes", () => {
  test("isolates each bounded index build in its own maintenance-window migration", () => {
    expect(migrations).toHaveLength(4);
    for (const migration of migrations) {
      expect(migration).toMatch(/^-- Rollback: forward-only\./);
      expect(migration).toContain("Production rollout: run in a maintenance window");
      expect(migration).toContain("SET LOCAL lock_timeout = '5s';");
      expect(migration).toContain("SET LOCAL statement_timeout = '30s';");
      expect(migration).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
      expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    }
  });

  test("matches the four paginated admin query boundaries", () => {
    const migration = compact(sql);
    expect(migration).toContain(
      "catalog_categories_leaf_scope_list_idx ON public.catalog_categories ( status, sort_order, id, ownership_scope, owner_tenant_id ) WHERE is_leaf = true",
    );
    expect(migration).toContain(
      "supplier_products_scope_list_idx ON public.supplier_products ( supplier_id, updated_at DESC, id DESC, ownership_scope, owner_tenant_id )",
    );
    expect(migration).toContain(
      "supplier_skus_scope_product_list_idx ON public.supplier_skus ( supplier_id, supplier_product_id, updated_at DESC, id DESC, ownership_scope, owner_tenant_id )",
    );
    expect(migration).toContain(
      "supplier_price_lists_tenant_relationship_list_idx ON public.supplier_price_lists ( tenant_id, tenant_supplier_id, supplier_id, effective_from DESC, id DESC )",
    );
  });
});
