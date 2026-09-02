import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260902100000_supplier_catalog_cost_category_rules.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("supplier catalog cost category rule migration", () => {
  test("creates tenant-scoped category defaults and product overrides", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);

    const normalized = compact(sql);
    expect(normalized).toContain(
      "CREATE TABLE public.tenant_catalog_cost_category_rules",
    );
    for (const field of [
      "tenant_id uuid NOT NULL",
      "rule_scope text NOT NULL",
      "catalog_category_id uuid NULL",
      "supplier_product_id uuid NULL",
      "cost_category_id uuid NOT NULL",
      "version integer NOT NULL DEFAULT 1",
    ]) expect(normalized).toContain(field);
    expect(normalized).toMatch(
      /CHECK \( \(rule_scope = 'category' AND catalog_category_id IS NOT NULL AND supplier_product_id IS NULL\) OR \(rule_scope = 'product' AND catalog_category_id IS NULL AND supplier_product_id IS NOT NULL\) \)/,
    );
    expect(normalized).toContain(
      "FOREIGN KEY (cost_category_id, tenant_id) REFERENCES public.finance_cost_categories(id, tenant_id)",
    );
    expect(normalized).toContain(
      "CREATE UNIQUE INDEX tenant_catalog_cost_category_rules_category_uidx ON public.tenant_catalog_cost_category_rules(tenant_id, catalog_category_id) WHERE rule_scope = 'category'",
    );
    expect(normalized).toContain(
      "CREATE UNIQUE INDEX tenant_catalog_cost_category_rules_product_uidx ON public.tenant_catalog_cost_category_rules(tenant_id, supplier_product_id) WHERE rule_scope = 'product'",
    );
  });

  test("validates tenant-visible catalog ownership and active cost categories", () => {
    const normalized = compact(sql);
    expect(normalized).toContain(
      "CREATE FUNCTION public.validate_tenant_catalog_cost_category_rule()",
    );
    expect(normalized).toMatch(
      /cost_category\.tenant_id = NEW\.tenant_id[\s\S]*cost_category\.status = 'active'/,
    );
    expect(normalized).toMatch(
      /category\.ownership_scope = 'platform'[\s\S]*category\.owner_tenant_id IS NULL[\s\S]*category\.ownership_scope = 'tenant'[\s\S]*category\.owner_tenant_id = NEW\.tenant_id/,
    );
    expect(normalized).toMatch(
      /product\.ownership_scope = 'platform'[\s\S]*product\.owner_tenant_id IS NULL[\s\S]*product\.ownership_scope = 'tenant'[\s\S]*product\.owner_tenant_id = NEW\.tenant_id/,
    );
    expect(normalized).toContain("SUPPLIER_COST_CATEGORY_RULE_INVALID");
  });

  test("resolves product overrides before nearest category ancestor defaults", () => {
    const normalized = compact(sql);
    expect(normalized).toContain(
      "CREATE FUNCTION public.resolve_tenant_catalog_cost_category(",
    );
    expect(normalized).toContain("WITH RECURSIVE category_path AS");
    expect(normalized).toContain("rule.rule_scope = 'product'");
    expect(normalized).toContain("rule.rule_scope = 'category'");
    expect(normalized).toMatch(
      /ORDER BY CASE candidate\.source WHEN 'product' THEN 0 ELSE 1 END, candidate\.depth ASC LIMIT 1/,
    );
    expect(normalized).toContain("cost_category.status = 'active'");
    expect(normalized).toContain("source text");
  });

  test("keeps rule storage and resolver service-role only", () => {
    const normalized = compact(sql);
    expect(normalized).toContain(
      "ALTER TABLE public.tenant_catalog_cost_category_rules ENABLE ROW LEVEL SECURITY",
    );
    expect(normalized).toContain(
      "REVOKE ALL ON public.tenant_catalog_cost_category_rules FROM PUBLIC, anon, authenticated",
    );
    expect(normalized).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_catalog_cost_category_rules TO service_role",
    );
    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.resolve_tenant_catalog_cost_category\( uuid, uuid, uuid \) FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_tenant_catalog_cost_category\( uuid, uuid, uuid \) TO service_role/,
    );
  });
});
