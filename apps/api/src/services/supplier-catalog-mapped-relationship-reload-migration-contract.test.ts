import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const migrationsDir = new URL("../../../../supabase/migrations/", import.meta.url);

function readMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

describe("supplier catalog mapped relationship reload migration contract", () => {
  test("repairs mapped catalog self relationships and reloads postgrest schema", () => {
    const sql = readMigrations();

    expect(sql.includes(
      "catalog_categories_mapped_platform_category_id_fkey",
    )).toBe(true);
    expect(sql.includes(
      "FOREIGN KEY (mapped_platform_category_id) REFERENCES public.catalog_categories(id) ON DELETE RESTRICT",
    )).toBe(true);
    expect(sql.includes("catalog_brands_mapped_platform_brand_id_fkey"))
      .toBe(true);
    expect(sql.includes(
      "FOREIGN KEY (mapped_platform_brand_id) REFERENCES public.catalog_brands(id) ON DELETE RESTRICT",
    )).toBe(true);
    expect(sql.includes("NOTIFY pgrst, 'reload schema'")).toBe(true);
  });
});
