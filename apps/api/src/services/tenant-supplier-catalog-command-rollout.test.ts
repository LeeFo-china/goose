import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

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
const verifier = read(
  "../../../../scripts/verify-tenant-supplier-catalog-command-migrations.sh",
);
const pre123SeedUrl = new URL(
  "../../../../scripts/fixtures/seed-tenant-supplier-catalog-command-pre-123.sql",
  import.meta.url,
);
const pre123Seed = existsSync(pre123SeedUrl)
  ? readFileSync(pre123SeedUrl, "utf8")
  : "";

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

  test("replays the old request identity before locking a base unit", () => {
    const compatibility = [...migration.matchAll(
      /CREATE FUNCTION public\.create_catalog_unit\([\s\S]*?\n\$\$;/g,
    )].map(([body]) => body)[1] ?? "";
    const requestStart = compatibility.indexOf("v_request := jsonb_build_object(");
    const requestEnd = compatibility.indexOf(");", requestStart);
    const request = compatibility.slice(requestStart, requestEnd);
    const eventLock = compatibility.indexOf("SELECT event.*");
    const hierarchyLock = compatibility.indexOf(
      "pg_catalog.pg_advisory_xact_lock(6720240723142001::bigint)",
    );
    const baseLock = compatibility.indexOf("FROM public.catalog_units AS base_unit");

    for (const field of [
      "code",
      "name",
      "symbol",
      "base_unit_id",
      "conversion_factor",
      "status",
      "sort_order",
      "actor_employee_id",
    ]) expect(request).toContain(`'${field}'`);
    for (const field of ["unit_id", "tenant_id", "unit_dimension"]) {
      expect(request).not.toContain(`'${field}'`);
    }
    expect(eventLock).toBeGreaterThan(requestEnd);
    expect(hierarchyLock).toBeGreaterThan(eventLock);
    expect(baseLock).toBeGreaterThan(hierarchyLock);
    expect(compatibility).not.toContain(
      "v_event.resource_id IS DISTINCT FROM p_unit_id",
    );
  });

  test("projects an exact legacy unit DTO for create and replay", () => {
    const compatibility = [...migration.matchAll(
      /CREATE FUNCTION public\.create_catalog_unit\([\s\S]*?\n\$\$;/g,
    )].map(([body]) => body)[1] ?? "";
    for (const field of [
      "id",
      "code",
      "name",
      "symbol",
      "base_unit_id",
      "conversion_factor",
      "status",
      "sort_order",
      "version",
      "created_by_employee_id",
      "updated_by_employee_id",
      "created_at",
      "updated_at",
    ]) expect(compatibility).toContain(`'${field}'`);
    expect(compatibility).not.toContain("'unit', v_event.to_state");
    expect(compatibility).not.toContain("'unit', v_snapshot");
  });

  test("seeds an actual old event between 122000 and 123000", () => {
    expect(pre123Seed).toContain("public.create_catalog_unit(");
    expect(pre123Seed).toContain("verify-pre-123-unit-create");
    const schema = verifier.indexOf('render_migration_body "${schema_file}"');
    const seed = verifier.indexOf('cat "${pre123_seed_file}"');
    const command = verifier.indexOf('render_migration_body "${command_file}"');
    expect(schema).toBeGreaterThan(0);
    expect(seed).toBeGreaterThan(schema);
    expect(command).toBeGreaterThan(seed);
  });
});
