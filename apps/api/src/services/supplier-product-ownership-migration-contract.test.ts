import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const MIGRATION_ROOT = "../../../../supabase/migrations/";
const HARDENING_MIGRATION =
  "20260819090000_harden_supplier_product_sku_contracts.sql";
const chainFiles = [
  "20260729160000_create_supplier_products_and_base_prices.sql",
  "20260813100000_add_supplier_ownership_foundation.sql",
  "20260813180000_scope_supplier_products_and_prices.sql",
  "20260813195000_allow_platform_product_write.sql",
  "20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql",
  "20260818122000_materialize_tenant_supplier_catalog_schema.sql",
  "20260818130000_harden_tenant_private_catalog_contracts.sql",
  HARDENING_MIGRATION,
] as const;

const immutableMigrations = new Map<string, string>([
  [
    "20260813170000_create_tenant_private_catalog.sql",
    "203480335a963db3537012889fe9d317eec24290fbab53c0a1227df506d1c670",
  ],
  [
    "20260813180000_scope_supplier_products_and_prices.sql",
    "77fe7e3403c670b09a72a77929c518fffac1f3c7bbb373b12092011544a133d1",
  ],
  [
    "20260813185000_scope_catalog_codes.sql",
    "d0a50ebb18395dfc071fcfc76cd889e18a005a20066488bb9fbf8d59526e82d8",
  ],
  [
    "20260813195000_allow_platform_product_write.sql",
    "6934417d363c8ba82a56d000e0742e1d3df359e05e59411e3cd2c79821332e0f",
  ],
]);

function migrationUrl(fileName: string): URL {
  return new URL(`${MIGRATION_ROOT}${fileName}`, import.meta.url);
}

function readMigration(fileName: string): string {
  const url = migrationUrl(fileName);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const hardeningSql = readMigration(HARDENING_MIGRATION);
const chainSql = chainFiles.map(readMigration).join("\n");

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractLastFunction(name: string): string {
  const matches = [...chainSql.matchAll(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "g",
  ))];
  return matches.at(-1)?.[0] ?? "";
}

describe("supplier product and SKU ownership hardening migration", () => {
  test("keeps all four applied migrations byte-for-byte immutable", () => {
    for (const [fileName, expectedHash] of immutableMigrations) {
      const actualHash = createHash("sha256")
        .update(readMigration(fileName))
        .digest("hex");
      expect(actualHash, fileName).toBe(expectedHash);
    }
  });

  test("is a bounded forward-only migration with a precise rollback", () => {
    expect(hardeningSql).toMatch(/^-- Rollback: forward-only\./);
    expect(hardeningSql).toContain("disable product and SKU write routes");
    expect(hardeningSql).toContain("restore the previous function definitions");
    expect(hardeningSql.toLowerCase()).toContain(
      "preserve existing ownership and spec data",
    );
    expect(hardeningSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(hardeningSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(hardeningSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(hardeningSql).not.toMatch(/supplier_price/i);
  });

  test("does not infer or require ownership for historical products and SKUs", () => {
    expect(hardeningSql).not.toMatch(
      /UPDATE public\.(?:supplier_products|supplier_skus)(?: AS [a-z_]+)?\s+SET\s+(?:ownership_scope|owner_tenant_id)/i,
    );
    const ownershipTableAlters = [
      ...hardeningSql.matchAll(
        /ALTER TABLE public\.(?:supplier_products|supplier_skus)[\s\S]*?;/gi,
      ),
    ].map((match) => match[0]).join("\n");
    expect(ownershipTableAlters).not.toContain(
      "ALTER COLUMN ownership_scope SET NOT NULL",
    );
    expect(ownershipTableAlters).not.toContain(
      "ALTER COLUMN owner_tenant_id SET NOT NULL",
    );
  });

  test("enforces the complete platform and tenant product ownership matrix", () => {
    const guard = compact(extractLastFunction("guard_supplier_product_ownership"));

    expect(guard).toContain("SUPPLIER_OWNERSHIP_IMMUTABLE");
    expect(guard).toContain("NEW.acting_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("v_supplier_scope = 'platform'");
    expect(guard).toContain("v_supplier_scope = 'tenant'");
    expect(guard).toContain("v_supplier_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("v_category_scope = 'platform'");
    expect(guard).toContain("v_brand_scope = 'platform'");
    expect(guard).toContain("v_category_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("v_brand_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("PRODUCT_OWNERSHIP_CONFLICT");
  });

  test("requires active leaf categories and active brands", () => {
    const validator = compact(
      extractLastFunction("validate_supplier_product_catalog"),
    );

    expect(validator).toContain("category.status = 'active'");
    expect(validator).toContain("category.is_leaf");
    expect(validator).toContain("brand.status = 'active'");
    expect(validator).toContain("SUPPLIER_CATALOG_REFERENCE_INVALID");
  });

  test("matches SKU ownership exactly to its product including platform NULL", () => {
    const guard = compact(extractLastFunction("guard_supplier_sku_ownership"));

    expect(guard).toContain("supplier_id = NEW.supplier_id");
    expect(guard).toContain("v_product.ownership_scope IS NOT DISTINCT FROM NEW.ownership_scope");
    expect(guard).toContain("v_product.owner_tenant_id IS NOT DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("NEW.acting_tenant_id IS NOT DISTINCT FROM v_product.owner_tenant_id");
    expect(guard).not.toContain("v_product.ownership_scope IS DISTINCT FROM 'tenant'");
    expect(guard).toContain("SUPPLIER_OWNERSHIP_IMMUTABLE");
    expect(guard).toContain("PRODUCT_OWNERSHIP_CONFLICT");
  });

  test("validates platform and tenant actors with NULL-safe tenant equality", () => {
    const actorGuard = compact(extractLastFunction("validate_supplier_proxy_actor"));
    const productWriteGuard = compact(
      extractLastFunction("guard_supplier_product_tenant_write"),
    );
    const skuWriteGuard = compact(
      extractLastFunction("guard_supplier_sku_tenant_write"),
    );

    expect(actorGuard).toContain(
      "employee.tenant_id IS NOT DISTINCT FROM NEW.acting_tenant_id",
    );
    for (const guard of [productWriteGuard, skuWriteGuard]) {
      expect(guard).toContain("OLD.ownership_scope IN ('platform', 'tenant')");
      expect(guard).toContain(
        "OLD.owner_tenant_id IS NOT DISTINCT FROM NEW.acting_tenant_id",
      );
      expect(guard).toContain("PRODUCT_OWNERSHIP_CONFLICT");
    }
  });

  test("installs private deterministic guards without opening unsafe RPCs", () => {
    for (const functionName of [
      "validate_supplier_proxy_actor",
      "guard_supplier_product_ownership",
      "guard_supplier_sku_ownership",
      "guard_supplier_product_tenant_write",
      "guard_supplier_sku_tenant_write",
    ]) {
      expect(hardeningSql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
    }
    expect(hardeningSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_platform_supplier_(?:product|sku)/,
    );
    expect(hardeningSql).toContain(
      "CREATE TRIGGER tr_supplier_skus_v3_guard_ownership",
    );
    expect(hardeningSql).toContain(
      "CREATE TRIGGER tr_supplier_skus_v3_guard_actor_scope",
    );
  });
});
