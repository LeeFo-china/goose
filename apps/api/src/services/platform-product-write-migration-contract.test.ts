import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813195000_allow_platform_product_write.sql",
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

describe("platform product write migration contract", () => {
  test("is transactional and forward-only", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  test("relaxes tenant-proxy constraints for platform products and SKUs", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_products[\s\S]*?ALTER COLUMN acting_tenant_id DROP NOT NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_products[\s\S]*?ALTER COLUMN proxy_reason DROP NOT NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_skus[\s\S]*?ALTER COLUMN acting_tenant_id DROP NOT NULL/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.supplier_skus[\s\S]*?ALTER COLUMN proxy_reason DROP NOT NULL/,
    );
    expect(sql).toMatch(/operation_source IN \('tenant_proxy', 'platform'\)/);
  });

  test("creates platform product and SKU command functions", () => {
    expect(extractFunction(sql, "create_platform_supplier_product")).not.toBe("");
    expect(extractFunction(sql, "create_platform_supplier_sku")).not.toBe("");
  });
});
