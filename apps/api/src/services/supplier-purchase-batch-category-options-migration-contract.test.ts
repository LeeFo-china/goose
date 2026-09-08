import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260908110000_resolve_supplier_purchase_batch_category_options.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function functionBody() {
  return sql.match(
    /CREATE FUNCTION public\.resolve_supplier_purchase_batch_category_options\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
}

describe("supplier purchase batch category options migration contract", () => {
  test("creates one read-only bounded RPC with an exact rollback signature", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toMatch(/COMMIT;\s*$/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '1min';");
    expect(sql).toContain(
      "DROP FUNCTION public.resolve_supplier_purchase_batch_category_options(uuid,timestamptz,text,integer,integer)",
    );
    const body = functionBody();
    expect(body).toContain("STABLE");
    expect(body).toContain("SECURITY INVOKER");
    expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolve_supplier_purchase_batch_category_options\([\s\S]*?FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_supplier_purchase_batch_category_options\([\s\S]*?TO service_role;/,
    );
  });

  test("inlines the latest eligibility gate without exposing its private helper", () => {
    const body = compact(functionBody());
    expect(body).not.toContain("get_tenant_supplier_order_eligibility_set");
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_tenant_supplier_order_eligibility_set/,
    );
    expect(body).toContain("qualification_type.status = 'active'");
    expect(body).toContain("qualification_type.blocks_new_orders");
    expect(body).toContain(
      "relationship.ownership_scope <> 'tenant' OR relationship.owner_tenant_id IS DISTINCT FROM relationship.tenant_id",
    );
    expect(body).toContain("qualification.verification_status = 'verified'");
    expect(body).toContain("qualification.valid_from IS NULL OR qualification.valid_from <= p_priced_at::date");
    expect(body).toContain("qualification.valid_until IS NULL OR qualification.valid_until >= p_priced_at::date");
    expect(body).toContain("contract.lifecycle_status = 'active'");
    expect(body).toContain("contract.valid_from <= p_priced_at::date");
    expect(body).toContain("contract.valid_until >= p_priced_at::date");
    expect(body).toContain("setting.require_active_contract_for_new_order");
    expect(body).toContain("NOT COALESCE(contract_status.has_active_contract, false)");
    expect(body).toContain("cardinality(evaluated.blocking_reasons) = 0 AS eligible");
    expect(body).toContain(
      "JOIN eligibility ON eligibility.tenant_supplier_id = relationship.id AND eligibility.supplier_id = relationship.supplier_id",
    );
  });

  test("excludes inactive brands and purchase or base units", () => {
    const body = compact(functionBody());
    expect(body).toContain(
      "JOIN public.catalog_brands AS brand ON brand.id = product.brand_id AND brand.status = 'active'",
    );
    expect(body).toContain(
      "JOIN public.catalog_units AS purchase_unit ON purchase_unit.id = price_item.purchase_unit_id AND purchase_unit.status = 'active'",
    );
    expect(body).toContain(
      "JOIN public.catalog_units AS base_unit ON base_unit.id = price_item.base_unit_id AND base_unit.status = 'active'",
    );
  });

  test("requires product, SKU, price item ownership and units to agree", () => {
    const body = compact(functionBody());
    expect(body).toContain("product.ownership_scope = sku.ownership_scope");
    expect(body).toContain(
      "product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id",
    );
    expect(body).toContain("product.id = price_item.supplier_product_id");
    expect(body).toContain("sku.purchase_unit_id = price_item.purchase_unit_id");
    expect(body).toContain("sku.base_unit_id = price_item.base_unit_id");
    expect(body).toContain(
      "sku.base_unit_conversion = price_item.base_unit_conversion",
    );
  });

  test("keeps only active leaf categories with one effective price candidate", () => {
    const body = compact(functionBody());
    expect(body).toContain("category.status = 'active'");
    expect(body).toContain("category.is_leaf");
    expect(body).toContain(
      "COUNT(*) OVER ( PARTITION BY relationship.id, sku.id ) AS candidate_count",
    );
    expect(body).toContain("FROM price_candidates WHERE candidate_count = 1");
    expect(body).toContain("SELECT DISTINCT id, code, name, full_name, status");
  });

  test("preserves tenant/platform visibility, category keyword and SQL pagination", () => {
    const body = compact(functionBody());
    expect(body.match(/ownership_scope = 'platform'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(body.match(/ownership_scope = 'tenant'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(body).toContain("category.code ILIKE v_keyword_pattern ESCAPE '\\'");
    expect(body).toContain("category.name ILIKE v_keyword_pattern ESCAPE '\\'");
    expect(body).toContain("category.full_name ILIKE v_keyword_pattern ESCAPE '\\'");
    expect(body).toContain("LIMIT p_page_size OFFSET v_offset");
    expect(body).toContain(
      "jsonb_build_object( 'id', page.id, 'code', page.code, 'name', page.name, 'full_name', page.full_name, 'status', page.status )",
    );
  });
});
