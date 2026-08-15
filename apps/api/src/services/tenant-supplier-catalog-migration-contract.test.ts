import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813170000_create_tenant_private_catalog.sql",
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

describe("tenant private catalog migration contract", () => {
  test("is transactional and documents the forward-only rollback", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  test("adds catalog mapping and display columns", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_categories[\s\S]*?ADD COLUMN full_name text/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_categories[\s\S]*?ADD COLUMN is_leaf boolean/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_categories[\s\S]*?ADD COLUMN mapped_platform_category_id uuid/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_brands[\s\S]*?ADD COLUMN mapped_platform_brand_id uuid/,
    );
  });

  test("creates spec definition and unit suggestion tables", () => {
    expect(sql).toMatch(/CREATE TABLE public\.catalog_spec_definitions/);
    expect(sql).toMatch(/CREATE TABLE public\.catalog_unit_suggestions/);
  });

  test("creates tenant catalog command functions", () => {
    expect(extractFunction(sql, "create_tenant_catalog_category")).not.toBe("");
    expect(extractFunction(sql, "update_tenant_catalog_category")).not.toBe("");
    expect(extractFunction(sql, "create_tenant_catalog_brand")).not.toBe("");
    expect(extractFunction(sql, "update_tenant_catalog_brand")).not.toBe("");
    expect(extractFunction(sql, "copy_platform_category_specs")).not.toBe("");
    expect(extractFunction(sql, "submit_catalog_unit_suggestion")).not.toBe("");
  });

  test("enforces RLS on catalog tables", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_categories ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_categories FORCE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_brands ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_spec_definitions ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.catalog_unit_suggestions ENABLE ROW LEVEL SECURITY/,
    );
  });

  test("backfills category full paths and seeds the platform no-brand record", () => {
    expect(sql).toMatch(/full_name/);
    expect(sql).toMatch(/无品牌/);
  });
});
