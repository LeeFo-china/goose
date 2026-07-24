import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260723142000_create_supplier_standard_catalog.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

function extractFunction(name: string) {
  return sql.match(
    new RegExp(`CREATE FUNCTION public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`),
  )?.[0] ?? "";
}

describe("supplier catalog hierarchy migration contract", () => {
  test("serializes category changes and keeps active children under active parents", () => {
    const categoryFunction = extractFunction("set_catalog_category_level");

    expect(categoryFunction).toMatch(
      /IF TG_OP = 'UPDATE'[\s\S]*OLD\.status = 'active'[\s\S]*NEW\.status = 'inactive'[\s\S]*FROM public\.catalog_categories AS child[\s\S]*child\.parent_id = OLD\.id[\s\S]*child\.status = 'active'[\s\S]*RAISE EXCEPTION '存在启用的子分类，当前目录分类不能停用';/,
    );
    expect(categoryFunction).toMatch(
      /SELECT parent\.level\s+INTO parent_level\s+FROM public\.catalog_categories AS parent\s+WHERE parent\.id = NEW\.parent_id\s+FOR UPDATE;[\s\S]*SELECT parent\.status\s+INTO parent_status\s+FROM public\.catalog_categories AS parent\s+WHERE parent\.id = NEW\.parent_id;/,
    );
    expect(categoryFunction).toMatch(
      /IF NEW\.status = 'active' AND parent_status <> 'active' THEN\s+RAISE EXCEPTION '启用的目录分类必须属于启用的父分类';/,
    );
    expect(sql.indexOf("tr_catalog_categories_lock_hierarchy")).toBeLessThan(
      sql.indexOf("tr_catalog_categories_set_level"),
    );
  });

  test("serializes unit changes and requires every derived unit to use an active base unit", () => {
    const unitFunction = extractFunction("validate_catalog_unit_base");

    expect(sql).toMatch(
      /CREATE FUNCTION public\.lock_catalog_unit_hierarchy\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = pg_catalog, public\s+AS \$\$[\s\S]*pg_advisory_xact_lock\(\d+::bigint\)[\s\S]*RETURN NULL;[\s\S]*\$\$;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.lock_catalog_unit_hierarchy\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER tr_catalog_units_lock_hierarchy\s+BEFORE INSERT OR UPDATE ON public\.catalog_units\s+FOR EACH STATEMENT\s+EXECUTE FUNCTION public\.lock_catalog_unit_hierarchy\(\);/,
    );
    expect(unitFunction).toMatch(
      /SELECT base_unit\.base_unit_id\s+INTO parent_base_unit_id\s+FROM public\.catalog_units AS base_unit\s+WHERE base_unit\.id = NEW\.base_unit_id\s+FOR UPDATE;[\s\S]*SELECT base_unit\.status\s+INTO parent_status\s+FROM public\.catalog_units AS base_unit\s+WHERE base_unit\.id = NEW\.base_unit_id;/,
    );
    expect(unitFunction).toMatch(
      /IF parent_status <> 'active' THEN\s+RAISE EXCEPTION '派生单位只能引用启用的基准单位';/,
    );
    expect(unitFunction).toMatch(
      /IF TG_OP = 'UPDATE'[\s\S]*OLD\.base_unit_id IS NULL[\s\S]*OLD\.status = 'active'[\s\S]*NEW\.status = 'inactive'[\s\S]*FROM public\.catalog_units AS derived_unit[\s\S]*derived_unit\.base_unit_id = OLD\.id[\s\S]*RAISE EXCEPTION '有派生单位引用的基准单位不能停用';/,
    );
    expect(unitFunction).toMatch(
      /NEW\.base_unit_id IS DISTINCT FROM OLD\.base_unit_id[\s\S]*RAISE EXCEPTION '已有派生单位引用的基准单位不能改为派生单位';/,
    );
    expect(sql.indexOf("tr_catalog_units_lock_hierarchy")).toBeLessThan(
      sql.indexOf("tr_catalog_units_validate_base"),
    );
  });

  test("keeps all catalog trigger functions private and documents complete rollback", () => {
    for (const functionName of [
      "lock_catalog_category_hierarchy",
      "set_catalog_category_level",
      "lock_catalog_unit_hierarchy",
      "validate_catalog_unit_base",
    ]) {
      expect(extractFunction(functionName)).toContain(
        "SET search_path = pg_catalog, public",
      );
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${functionName}()\n` +
          "  FROM PUBLIC, anon, authenticated, service_role;",
      );
    }

    expect(sql).toMatch(
      /^-- Rollback:[\s\S]*drop the seven catalog triggers[\s\S]*lock_catalog_unit_hierarchy\(\)/,
    );
  });
});
