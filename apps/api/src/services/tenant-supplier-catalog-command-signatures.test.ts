import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
  import.meta.url,
);
const migrationSql = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";
const normalizedSql = migrationSql.replace(/\s+/g, " ");

const canonicalSignatures = [
  "create_catalog_unit(uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text)",
  "create_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text)",
  "update_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text)",
  "create_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text)",
  "update_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text)",
  "create_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text)",
  "update_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text)",
  "copy_platform_category_specs(uuid, uuid, integer, uuid, uuid, uuid, text)",
  "submit_tenant_catalog_unit_suggestion(uuid, text, text, text, text, text, uuid, uuid, uuid, text)",
  "list_catalog_unit_suggestions(uuid, uuid, text, uuid, integer, integer)",
  "review_catalog_unit_suggestion(uuid, text, uuid, text, integer, uuid, uuid, text)",
] as const;

describe("tenant supplier catalog command signatures", () => {
  test("materializes the command migration between schema and hardening", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(migrationSql).toMatch(/^-- Rollback: forward-only\./);
    expect(migrationSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(migrationSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(migrationSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(migrationSql).toContain("20260818122000");
    expect(migrationSql.indexOf("20260818122000")).toBeLessThan(
      migrationSql.indexOf("20260818130000"),
    );
  });

  test("preflights the deterministic 122000 schema and both legacy states", () => {
    expect(migrationSql).toContain("SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED");
    expect(migrationSql).toContain("catalog_unit_suggestions_v2_review_state_check");
    expect(migrationSql).toContain("catalog_spec_definitions_v2_ownership_check");
    expect(migrationSql).toContain("repository_chain");
    expect(migrationSql).toContain("granular_v2");
    expect(migrationSql).toContain("pg_proc");
  });

  test("drops every recognized legacy overload without cascade", () => {
    expect(migrationSql).toContain(
      "DROP FUNCTION IF EXISTS public.submit_catalog_unit_suggestion(",
    );
    expect(migrationSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_catalog_unit\(\s*uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text\s*\)/,
    );
    expect(migrationSql).toContain("SUPPLIER_CATALOG_COMMAND_DEPENDENCY_UNKNOWN");
    expect(migrationSql).not.toMatch(/DROP FUNCTION[\s\S]{0,300}\bCASCADE\b/i);
  });

  test("creates exactly the canonical identity argument set", () => {
    for (const signature of canonicalSignatures) {
      expect(normalizedSql).toContain(signature);
    }
    expect(migrationSql).toContain("canonical_command_signatures");
    expect(migrationSql).toContain("unexpected command overloads remain");
  });

  test("normalizes command event resource types", () => {
    expect(migrationSql).toContain("supplier_command_events_resource_type_check");
    expect(migrationSql).toContain("SUPPLIER_COMMAND_RESOURCE_TYPE_UNKNOWN");
    expect(migrationSql).toContain("'catalog_spec_definition'");
    expect(migrationSql).toContain("'catalog_unit_suggestion'");
    expect(migrationSql).toMatch(/ADD CONSTRAINT supplier_command_events_resource_type_check[\s\S]*NOT VALID/);
    expect(migrationSql).toContain(
      "VALIDATE CONSTRAINT supplier_command_events_resource_type_check",
    );
    expect(migrationSql).toContain("SUPPLIER_COMMAND_EVENT_VALIDATION_TOO_LARGE");
    expect(migrationSql).toContain(
      "use a separately reviewed validation migration",
    );
  });
});
