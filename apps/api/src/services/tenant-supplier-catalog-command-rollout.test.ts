import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function slice(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}

const migration = read(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
);
const repository = read("../repositories/supplier-catalog.ts");
const schema = read("../schema/supplier-catalog.ts");
const databaseTypes = read("../types/database.ts");

describe("tenant supplier catalog unit rollout compatibility", () => {
  test("proves the deployed API still calls the eleven-argument unit RPC", () => {
    const createSchema = slice(
      schema,
      "export const CatalogUnitCreateSchema",
      "export const CatalogUnitUpdateSchema",
    );
    const createRepositoryMethod = slice(
      repository,
      "  createUnit(input: CatalogUnitCreateCommand) {",
      "  updateUnit(input: CatalogUnitUpdateRecord) {",
    );
    const generatedRpc = slice(
      databaseTypes,
      "      create_catalog_unit: {",
      "      create_douyin_template_development_installation:",
    );

    expect(createSchema).not.toContain("unit_dimension");
    expect(createRepositoryMethod).not.toContain("p_unit_dimension");
    expect(generatedRpc).not.toContain("p_unit_dimension");
    expect(createRepositoryMethod).toContain("p_conversion_factor");
  });

  test("keeps one deprecated eleven-argument overload beside the canonical RPC", () => {
    const normalized = migration.replace(/\s+/g, " ");
    expect(migration.match(/^CREATE FUNCTION public\.create_catalog_unit\(/gm))
      .toHaveLength(2);
    expect(normalized).toContain(
      "create_catalog_unit(uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text)",
    );
    expect(normalized).toContain(
      "create_catalog_unit(uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text)",
    );
    expect(migration).toContain("Task 3 API rollout cleanup gate");
    expect(migration).toContain("forward cleanup migration");
  });

  test("keeps both rollout entry points private to service_role", () => {
    const unitFunctions = [...migration.matchAll(
      /CREATE FUNCTION public\.create_catalog_unit\([\s\S]*?\n\$\$;/g,
    )].map(([body]) => body);
    expect(unitFunctions).toHaveLength(2);
    for (const body of unitFunctions) {
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = pg_catalog, public");
      expect(body).toContain("public.assert_platform_catalog_actor(");
    }
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_catalog_unit\(\s*uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text\s*\)[\s\S]*?TO service_role;/,
    );
  });
});
