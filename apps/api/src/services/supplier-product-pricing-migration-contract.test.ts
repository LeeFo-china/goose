import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const TABLES = [
  "supplier_products",
  "supplier_skus",
  "supplier_price_lists",
  "supplier_price_list_items",
] as const;

const COMMAND_FUNCTIONS = [
  "create_supplier_product",
  "create_supplier_sku",
  "mutate_supplier_product",
  "mutate_supplier_sku",
  "create_supplier_price_list",
  "publish_supplier_price_list",
  "create_supplier_price_list_version",
  "retire_supplier_price_list",
] as const;

function extractFunction(name: string) {
  return sql.match(
    new RegExp(
      `CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0] ?? "";
}

describe("supplier product pricing migration contract", () => {
  test("creates precise product, SKU and immutable price version tables", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
    }

    expect(sql).toContain("numeric(18, 8)");
    expect(sql).toContain("numeric(14, 2)");
    expect(sql).toContain("numeric(7, 6)");
    expect(sql).toContain("supplier_products_supplier_code_key");
    expect(sql).toContain("supplier_skus_supplier_code_key");
    expect(sql).toContain("supplier_price_lists_one_draft_idx");
    expect(sql).toContain(
      "supplier_price_list_items_base_quantity_check",
    );
    expect(sql).toContain(
      "UNIQUE (supplier_price_list_id, supplier_sku_id)",
    );
  });

  test("records tenant proxy audit metadata and seeds isolated permissions", () => {
    expect(sql).toContain("acting_tenant_id uuid NOT NULL");
    expect(sql).toContain("acting_employee_id uuid NOT NULL");
    expect(sql).toContain(
      "operation_source text NOT NULL DEFAULT 'tenant_proxy'",
    );
    expect(sql).toContain("proxy_reason text NOT NULL");
    expect(sql).toContain(
      "CHECK (operation_source = 'tenant_proxy')",
    );

    for (const permission of [
      "supplier.product.view",
      "supplier.product.manage",
      "supplier.cost-price.view",
      "supplier.cost-price.manage",
    ]) {
      expect(sql).toContain(`'${permission}'`);
    }
    expect(sql).toMatch(
      /WHERE roles\.code = 'system_admin'[\s\S]*roles\.tenant_id IS NOT NULL/,
    );
  });

  test("enforces catalog and unit invariants in private trigger functions", () => {
    const productCatalog = extractFunction(
      "validate_supplier_product_catalog",
    );
    const skuUnit = extractFunction("prepare_supplier_sku_unit");
    const immutablePrice = extractFunction(
      "lock_published_supplier_price_data",
    );

    expect(productCatalog).toContain(
      "SET search_path = pg_catalog, public",
    );
    expect(productCatalog).toMatch(
      /catalog_categories[\s\S]*status = 'active'[\s\S]*NOT EXISTS[\s\S]*catalog_categories AS child/,
    );
    expect(productCatalog).toMatch(
      /catalog_brands[\s\S]*status = 'active'/,
    );
    expect(skuUnit).toContain("SET search_path = pg_catalog, public");
    expect(skuUnit).toContain(
      "SELECT unit.status, unit.base_unit_id, unit.conversion_factor",
    );
    expect(skuUnit).toContain("FROM public.catalog_units AS unit");
    expect(skuUnit).toContain("NEW.base_unit_conversion := CASE");
    expect(skuUnit).toContain("purchase_unit_status <> 'active'");
    expect(immutablePrice).toContain(
      "SET search_path = pg_catalog, public",
    );
    expect(immutablePrice).toContain(
      "SUPPLIER_PRICE_LIST_INVALID_ACTION",
    );

    for (const functionName of [
      "validate_supplier_product_catalog",
      "prepare_supplier_sku_unit",
      "lock_published_supplier_price_data",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
            "FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
    }
  });

  test("forces RLS, narrows grants and creates bounded lookup indexes", () => {
    for (const table of TABLES) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }

    expect(sql).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*public\.supplier_products[\s\S]*public\.supplier_skus[\s\S]*public\.supplier_price_lists[\s\S]*public\.supplier_price_list_items[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*public\.supplier_products[\s\S]*public\.supplier_skus[\s\S]*public\.supplier_price_lists[\s\S]*public\.supplier_price_list_items[\s\S]*TO service_role;/,
    );

    for (const index of [
      "supplier_products_supplier_status_updated_idx",
      "supplier_skus_product_status_updated_idx",
      "supplier_price_lists_supplier_status_effective_idx",
      "supplier_price_items_list_sku_idx",
      "supplier_price_items_sku_list_idx",
    ]) {
      expect(sql).toContain(`CREATE INDEX ${index}`);
    }
  });

  test("adds protected idempotent commands for product and price lifecycles", () => {
    for (const functionName of COMMAND_FUNCTIONS) {
      const fn = extractFunction(functionName);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public");
      expect(fn).toContain("supplier_command_events");
      expect(fn).toContain("idempotency_key");
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
            "FROM PUBLIC, anon, authenticated;",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
            "TO service_role;",
        ),
      );
    }

    expect(sql).toMatch(
      /supplier_command_events_resource_type_check[\s\S]*'supplier_product'[\s\S]*'supplier_sku'[\s\S]*'supplier_price_list'/,
    );
  });

  test("serializes publication and rejects overlapping effective periods", () => {
    const publish = extractFunction("publish_supplier_price_list");
    const compactPublish = publish.replace(/\s+/g, " ");

    expect(publish).toContain("pg_advisory_xact_lock");
    expect(publish).toContain("hashtextextended");
    expect(publish).toContain("SUPPLIER_PRICE_PERIOD_CONFLICT");
    expect(compactPublish).toContain(
      "published.effective_from < " +
        "COALESCE(draft.effective_until, 'infinity'::timestamptz)",
    );
    expect(compactPublish).toContain(
      "COALESCE( published.effective_until, 'infinity'::timestamptz ) > " +
        "draft.effective_from",
    );
    expect(publish).toContain("product.status <> 'active'");
    expect(publish).toContain("sku.status <> 'active'");
  });

  test("documents a forward rollback that preserves referenced history", () => {
    expect(sql).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*purchase order[\s\S]*do not drop/i,
    );
  });
});
