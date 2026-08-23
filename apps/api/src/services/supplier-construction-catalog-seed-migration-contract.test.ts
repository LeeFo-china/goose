import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260823170000_seed_supplier_construction_catalog_defaults.sql",
  import.meta.url,
);

const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("supplier construction catalog seed migration contract", () => {
  test("seeds a focused construction-material category baseline", () => {
    expect(migrationSql).not.toBe("");
    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(migrationSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(migrationSql).toContain("construction_category_seed");
    expect(migrationSql).toContain("ownership_scope");
    expect(migrationSql).toContain("'platform'");
    expect(migrationSql).toContain("owner_tenant_id");
    expect(migrationSql).toContain("NULL");

    for (const [code, name] of [
      ["MAT_MAIN", "主材"],
      ["MAT_MAIN_TILE", "瓷砖"],
      ["MAT_MAIN_TILE_FLOOR", "地砖"],
      ["MAT_MAIN_TILE_WALL", "墙砖"],
      ["MAT_AUX", "辅材"],
      ["MAT_AUX_WATERPROOF", "防水材料"],
      ["MAT_AUX_PUTTY_PAINT_PUTTY", "腻子粉"],
      ["MAT_WATER_ELECTRIC", "水电材料"],
      ["MAT_WATER_ELECTRIC_WIRE", "电线电缆"],
      ["MAT_WATER_ELECTRIC_PIPE", "管材管件"],
    ] as const) {
      expect(migrationSql).toContain(`'${code}'`);
      expect(migrationSql).toContain(`'${name}'`);
    }

    expect(migrationSql).toContain("ON CONFLICT (upper(btrim(code)))");
    expect(migrationSql).toContain("DO UPDATE SET");
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM public\.catalog_categories\b/i);
  });

  test("seeds common platform units across construction dimensions", () => {
    expect(migrationSql).not.toBe("");
    expect(migrationSql).toContain("construction_unit_seed");
    expect(migrationSql).toContain("unit_dimension");

    for (const [code, name, dimension] of [
      ["UNIT_PC", "个", "quantity"],
      ["UNIT_SET", "套", "quantity"],
      ["UNIT_SHEET", "片", "quantity"],
      ["UNIT_BOX", "箱", "quantity"],
      ["UNIT_ROLL", "卷", "quantity"],
      ["UNIT_M", "米", "length"],
      ["UNIT_SQM", "平方米", "area"],
      ["UNIT_CBM", "立方米", "volume"],
      ["UNIT_L", "升", "volume"],
      ["UNIT_KG", "千克", "weight"],
      ["UNIT_TON", "吨", "weight"],
    ] as const) {
      expect(migrationSql).toContain(`'${code}'`);
      expect(migrationSql).toContain(`'${name}'`);
      expect(migrationSql).toContain(`'${dimension}'`);
    }

    expect(migrationSql).toContain("ON CONFLICT (upper(btrim(code)))");
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM public\.catalog_units\b/i);
  });
});
