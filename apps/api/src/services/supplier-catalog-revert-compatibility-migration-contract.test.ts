import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string) {
  return sql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0] ?? "";
}

describe("supplier catalog rollback compatibility migration", () => {
  test("derives immutable tenant ownership inside product and SKU writes", () => {
    const productGuard = compact(
      extractFunction("guard_supplier_product_ownership"),
    );
    const skuGuard = compact(
      extractFunction("guard_supplier_sku_ownership"),
    );

    expect(productGuard).toContain("TG_OP = 'INSERT'");
    expect(productGuard).toContain("NEW.ownership_scope := 'tenant'");
    expect(productGuard).toContain(
      "NEW.owner_tenant_id := NEW.acting_tenant_id",
    );
    expect(productGuard).toContain("TG_OP = 'UPDATE'");
    expect(productGuard).toContain(
      "NEW.ownership_scope IS DISTINCT FROM OLD.ownership_scope",
    );
    expect(productGuard).toContain("SUPPLIER_OWNERSHIP_IMMUTABLE");

    expect(skuGuard).toContain("TG_OP = 'INSERT'");
    expect(skuGuard).toContain(
      "NEW.ownership_scope := v_product.ownership_scope",
    );
    expect(skuGuard).toContain(
      "NEW.owner_tenant_id := v_product.owner_tenant_id",
    );
    expect(skuGuard).toContain(
      "v_product.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id",
    );
    expect(skuGuard).toContain("SUPPLIER_OWNERSHIP_IMMUTABLE");
  });

  test("rejects tenant proxy updates outside the current tenant ownership", () => {
    const productWriteGuard = compact(
      extractFunction("guard_supplier_product_tenant_write"),
    );
    const skuWriteGuard = compact(
      extractFunction("guard_supplier_sku_tenant_write"),
    );

    for (const guard of [productWriteGuard, skuWriteGuard]) {
      expect(guard).toContain(
        "OLD.ownership_scope IS DISTINCT FROM 'tenant'",
      );
      expect(guard).toContain(
        "OLD.owner_tenant_id IS DISTINCT FROM NEW.acting_tenant_id",
      );
      expect(guard).toContain("PRODUCT_OWNERSHIP_CONFLICT");
    }
    expect(sql).toContain(
      "CREATE TRIGGER tr_supplier_products_guard_tenant_write",
    );
    expect(sql).toContain(
      "CREATE TRIGGER tr_supplier_skus_guard_tenant_write",
    );
  });

  test("derives price tenant and validates parent, source, and SKU scopes", () => {
    const priceGuard = compact(
      extractFunction("guard_supplier_price_tenant"),
    );

    expect(priceGuard).toContain("TG_OP = 'INSERT'");
    expect(priceGuard).toContain("NEW.tenant_id := NEW.acting_tenant_id");
    expect(priceGuard).toContain(
      "NEW.tenant_id IS DISTINCT FROM NEW.acting_tenant_id",
    );
    expect(priceGuard).toContain(
      "NEW.tenant_id IS DISTINCT FROM OLD.tenant_id",
    );
    expect(priceGuard).toContain(
      "v_source_tenant_id IS DISTINCT FROM NEW.tenant_id",
    );
    expect(priceGuard).toContain(
      "v_price_list_tenant_id IS DISTINCT FROM NEW.tenant_id",
    );
    expect(priceGuard).toContain(
      "v_sku_owner_tenant_id IS DISTINCT FROM NEW.tenant_id",
    );
    expect(priceGuard).toContain("PRODUCT_OWNERSHIP_CONFLICT");
  });

  test("scopes legacy lifecycle commands before they can expose row state", () => {
    const productMutation = compact(
      extractFunction("mutate_supplier_product"),
    );
    const skuMutation = compact(
      extractFunction("mutate_supplier_sku_for_product"),
    );

    for (const command of [productMutation, skuMutation]) {
      expect(command).toContain("ownership_scope = 'tenant'");
      expect(command).toContain("owner_tenant_id = p_tenant_id");
    }

    for (const functionName of [
      "publish_supplier_price_list",
      "create_supplier_price_list_version",
      "retire_supplier_price_list",
      "upsert_supplier_price_list_item",
      "delete_supplier_price_list_item",
    ]) {
      const command = compact(extractFunction(functionName));
      expect(command).toContain("tenant_id = p_tenant_id");
      expect(command).toContain(`${functionName}_pre_v2_unsafe`);
    }

    for (const functionName of [
      "mutate_supplier_product",
      "mutate_supplier_sku_for_product",
      "publish_supplier_price_list",
      "create_supplier_price_list_version",
      "retire_supplier_price_list",
      "upsert_supplier_price_list_item",
      "delete_supplier_price_list_item",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}_pre_v2_unsafe\\(` +
            "[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
    }
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.mutate_supplier_sku\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });

  test("keeps blocking index builds out of the compatibility migration", () => {
    for (const index of [
      "supplier_products_supplier_owner_updated_idx",
      "supplier_skus_product_owner_updated_idx",
      "supplier_price_lists_tenant_supplier_status_idx",
      "supplier_price_items_tenant_list_sku_idx",
    ]) {
      expect(sql).not.toContain(`CREATE INDEX ${index}`);
    }
  });

  test("smoke executes wrappers as service_role and covers NULL ownership", () => {
    const smokePath = new URL(
      "../../../../scripts/smoke-supplier-catalog-revert-compatibility.sql",
      import.meta.url,
    );
    const smoke = readFileSync(smokePath, "utf8");

    expect(smoke).toContain("SET LOCAL ROLE service_role;");
    expect(smoke).toContain("RESET ROLE;");
    expect(smoke).toContain("v_is_security_definer IS DISTINCT FROM true");
    expect(smoke).toContain("search_path=pg_catalog, public");
    expect(smoke).toContain("acting_tenant_id = NULL");
    expect(smoke).toContain("legacy product NULL-actor update was not rejected");
    expect(smoke).toContain("legacy SKU NULL-actor update was not rejected");
  });

  test("is forward-only and preserves the applied schema", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE|FUNCTION)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE[\s\S]*DROP\s+(?:COLUMN|CONSTRAINT)/i);

    for (const functionName of [
      "guard_supplier_product_ownership",
      "guard_supplier_sku_ownership",
      "guard_supplier_product_tenant_write",
      "guard_supplier_sku_tenant_write",
      "guard_supplier_price_tenant",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
            "FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
    }
  });
});
