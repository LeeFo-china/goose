import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const smokeUrl = new URL(
  "../../../../scripts/smoke-supplier-prices-task7.sql",
  import.meta.url,
);
const sql = existsSync(smokeUrl) ? readFileSync(smokeUrl, "utf8") : "";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractDoBlock(name: string) {
  const delimiter = `\\$${name}\\$`;
  return sql.match(new RegExp(
    `DO ${delimiter}[\\s\\S]*?${delimiter};`,
  ))?.[0] ?? "";
}

describe("Task 7 supplier price database smoke", () => {
  test("is local-only, fixture-owned, repeatable and always rolled back", () => {
    expect(sql).toContain("127.0.0.1:54322");
    expect(sql).toContain("current_setting('task7.local_endpoint', true)");
    expect(sql).toContain("b7000000-0000-4000-8000-000000000001");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bROLLBACK;\s*$/);
    expect(sql).not.toMatch(/\bCOMMIT;/);
    expect(sql).not.toContain("ORDER BY id LIMIT 1");
    expect(sql).toContain("task7 fixture residue");
  });

  test("creates two tenants and active plus inactive relationships", () => {
    for (const marker of [
      "task7 tenant A",
      "task7 tenant B",
      "task7 active relationship",
      "task7 inactive relationship",
    ]) {
      expect(sql, marker).toContain(marker);
    }
  });

  test("probes the composite FK metadata required by PostgREST embeds", () => {
    const probe = extractDoBlock("task7_postgrest_relationships");
    expect(probe).toContain("FROM pg_catalog.pg_constraint");
    expect(probe).toContain("pg_catalog.generate_subscripts");
    expect(probe).toContain("JOIN pg_catalog.pg_attribute");
    expect(probe).toMatch(
      /supplier_price_items_list_tenant_supplier_fkey[\s\S]*?supplier_price_list_id', 'tenant_id', 'supplier_id'[\s\S]*?public\.supplier_price_lists/,
    );
    expect(probe).toMatch(
      /supplier_price_items_sku_supplier_fkey[\s\S]*?supplier_sku_id', 'supplier_id'[\s\S]*?public\.supplier_skus/,
    );
  });

  test("proves both visible SKU ownership modes share tenant A pricing", () => {
    for (const marker of [
      "task7 platform SKU price",
      "task7 tenant A SKU price",
      "task7 tenant B price absence",
      "task7 tenant B write not found",
      "task7 operation source tenant",
      "task7 proxy reason null",
    ]) {
      expect(sql, marker).toContain(marker);
    }
  });

  test("covers replay authorization, immutability and version replacement", () => {
    for (const marker of [
      "task7 idempotent replay",
      "task7 inactive relationship historical read",
      "task7 inactive relationship replay rejection",
      "task7 inactive relationship write rejection",
      "task7 published update rejection",
      "task7 published item mutation rejection",
      "task7 new version success",
    ]) {
      expect(sql, marker).toContain(marker);
    }
  });

  test("executes legacy proxy retirement and preserves its provenance", () => {
    const legacy = extractDoBlock("task7_legacy_proxy_retire");
    expect(legacy).toContain("public.create_supplier_price_list(");
    expect(legacy).toContain("public.upsert_supplier_price_list_item(");
    expect(legacy).toContain("public.publish_supplier_price_list(");
    expect(legacy).toMatch(
      /public\.command_supplier_price_list_v2\([\s\S]*?'retire'/,
    );
    expect(legacy).toContain("IF NOT EXISTS (");
    expect(legacy).toContain(
      "operation_source IS NOT DISTINCT FROM v_operation_source",
    );
    expect(legacy).toContain(
      "proxy_reason IS NOT DISTINCT FROM v_proxy_reason",
    );
    expect(legacy).toContain("lifecycle_status = 'retired'");
    expect(legacy).toContain("task7 legacy proxy provenance preserved");
  });

  test("compares every copied new-version item against its source", () => {
    const behavior = extractDoBlock("task7_price_behavior");
    const normalized = compact(behavior);
    expect(behavior).toContain("task7 new version copied item facts");
    expect(behavior).toContain(
      "FROM public.supplier_price_list_items AS source_item",
    );
    expect(behavior).toContain(
      "JOIN public.supplier_price_list_items AS copied_item",
    );
    for (const field of [
      "supplier_product_id",
      "supplier_sku_id",
      "minimum_quantity",
      "maximum_quantity",
      "purchase_unit_id",
      "base_unit_id",
      "base_unit_conversion",
      "unit_price",
      "tax_rate",
      "tax_inclusive",
    ]) {
      expect(normalized).toContain(
        `copied_item.${field} IS NOT DISTINCT FROM source_item.${field}`,
      );
    }
  });

  test("executes new-version replay before a stable target conflict", () => {
    const behavior = compact(extractDoBlock("task7_price_behavior"));
    const replay = behavior.indexOf("task7 new version idempotent replay");
    const conflict = behavior.indexOf("task7 existing new-version target conflict");
    expect(replay).toBeGreaterThanOrEqual(0);
    expect(conflict).toBeGreaterThan(replay);
    expect(behavior.slice(replay, conflict)).toContain(
      "v_result ->> 'idempotent' <> 'true'",
    );
    expect(behavior.slice(conflict)).toContain(
      "v_result ->> 'status' <> 'state_conflict'",
    );
    expect(behavior.slice(conflict)).toContain(
      "v_result ->> 'reason' <> 'target_already_exists'",
    );
  });

  test("avoids the unstable service-role negative invocation path", () => {
    expect(sql).not.toMatch(/SET LOCAL ROLE service_role/);
    expect(sql).not.toMatch(/SET ROLE service_role/);
    expect(sql).toContain("has_function_privilege('service_role'");
  });
});
