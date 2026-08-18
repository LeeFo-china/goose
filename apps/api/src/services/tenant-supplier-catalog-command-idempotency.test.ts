import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

const writeCommands = [
  "create_catalog_unit",
  "create_tenant_catalog_category",
  "update_tenant_catalog_category",
  "create_tenant_catalog_brand",
  "update_tenant_catalog_brand",
  "create_catalog_spec_definition",
  "update_catalog_spec_definition",
  "copy_platform_category_specs",
  "submit_tenant_catalog_unit_suggestion",
  "review_catalog_unit_suggestion",
] as const;

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("tenant supplier catalog command idempotency", () => {
  test("validates and serializes every write idempotency key", () => {
    for (const command of writeCommands) {
      const body = functionBody(command);
      expect(body).toContain("btrim(p_idempotency_key) = ''");
      expect(body).toContain("char_length(p_idempotency_key) > 120");
      expect(body).toContain("pg_catalog.pg_advisory_xact_lock(");
      expect(body).toContain("p_actor_user_id::text");
      expect(body).toContain("p_idempotency_key");
      expect(body).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    }
  });

  test("persists a normalized request and append-only snapshots", () => {
    for (const command of writeCommands) {
      const body = functionBody(command);
      expect(body).toContain("v_request := jsonb_build_object(");
      expect(body).toContain("v_event.from_state -> '_request' IS DISTINCT FROM v_request");
      expect(body).toContain("INSERT INTO public.supplier_command_events");
      expect(body).toContain("jsonb_build_object('_request', v_request)");
      expect(body).toContain("result_version");
    }
  });

  test("includes identity, ownership, version, and writable fields in requests", () => {
    for (const field of [
      "actor_employee_id",
      "tenant_id",
      "expected_version",
      "category_id",
      "brand_id",
      "spec_definition_id",
      "suggestion_id",
      "unit_id",
      "mapped_platform_category_id",
      "mapped_platform_brand_id",
    ]) {
      expect(sql).toContain(`'${field}'`);
    }
  });

  test("uses correct audit resource identities", () => {
    expect(functionBody("create_catalog_spec_definition")).toContain(
      "'catalog_spec_definition'",
    );
    expect(functionBody("update_catalog_spec_definition")).toContain(
      "'catalog_spec_definition'",
    );
    expect(functionBody("submit_tenant_catalog_unit_suggestion")).toContain(
      "'catalog_unit_suggestion'",
    );
    expect(functionBody("review_catalog_unit_suggestion")).toContain(
      "'catalog_unit_suggestion'",
    );
  });

  test("does not swallow write exceptions into false success", () => {
    expect(sql).not.toMatch(/WHEN unique_violation[\s\S]{0,500}RETURN jsonb_build_object/i);
    expect(sql).not.toMatch(/WHEN foreign_key_violation[\s\S]{0,500}RETURN jsonb_build_object/i);
  });
});
