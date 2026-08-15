import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813185000_scope_catalog_codes.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("catalog code scope migration contract", () => {
  test("is transactional and forward-only", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  test("drops global category and brand code uniqueness", () => {
    expect(sql).toMatch(/DROP CONSTRAINT catalog_categories_code_key/);
    expect(sql).toMatch(/DROP CONSTRAINT catalog_brands_code_key/);
  });

  test("keeps units globally unique", () => {
    expect(sql).not.toMatch(/DROP CONSTRAINT catalog_units_code_key/);
  });

  test("adds scope-aware category and brand code indexes", () => {
    expect(sql).toMatch(/catalog_categories_platform_code_unique_idx/);
    expect(sql).toMatch(/catalog_categories_tenant_code_unique_idx/);
    expect(sql).toMatch(/catalog_brands_platform_code_unique_idx/);
    expect(sql).toMatch(/catalog_brands_tenant_code_unique_idx/);
  });
});
