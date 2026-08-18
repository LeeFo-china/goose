import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const behaviorSql = readFileSync(
  new URL(
    "../../../../scripts/fixtures/verify-tenant-supplier-catalog-command-behavior.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("tenant supplier catalog unit suggestions", () => {
  test("submits suggestions only through a valid tenant actor", () => {
    const body = functionBody("submit_tenant_catalog_unit_suggestion");
    expect(body).toContain("public.assert_tenant_supplier_actor(");
    expect(body).toContain("private_catalog_writes_enabled");
    expect(body).toContain("'status', 'submitted'");
    expect(body).toContain("'catalog_unit_suggestion'");
  });

  test("lists through a user-bound tenant or platform actor", () => {
    const body = functionBody("list_catalog_unit_suggestions");
    expect(body).toContain("p_actor_user_id uuid");
    expect(body).toContain("p_actor_employee_id uuid");
    expect(body).toContain("INTO v_actor_tenant_id");
    expect(body).toContain("public.assert_tenant_supplier_actor(");
    expect(body).toContain("public.assert_platform_catalog_actor(");
    expect(body).toContain("v_effective_tenant_id := v_actor_tenant_id");
    expect(body).toContain("suggestion.tenant_id = v_effective_tenant_id");
  });

  test("enforces bounded page defaults and returns pagination metadata", () => {
    const body = functionBody("list_catalog_unit_suggestions");
    expect(body).toContain("COALESCE(p_page, 1)");
    expect(body).toContain("COALESCE(p_page_size, 20)");
    expect(body).toContain("p_page_size > 100");
    expect(body).toContain("LIMIT v_page_size");
    expect(body).toContain(
      "OFFSET (v_page::bigint - 1) * v_page_size",
    );
    expect(body).toContain("'total'");
    expect(body).toContain("'page'");
    expect(body).toContain("'pageSize'");
  });

  test("returns an explicit suggestion DTO without actor employee identifiers", () => {
    const body = functionBody("list_catalog_unit_suggestions");
    for (const field of [
      "id",
      "tenant_id",
      "suggested_code",
      "suggested_name",
      "suggested_symbol",
      "unit_dimension",
      "reason",
      "status",
      "version",
      "reviewed_at",
      "review_remark",
      "approved_catalog_unit_id",
      "created_at",
      "updated_at",
    ]) {
      expect(body).toContain(`'${field}', page_rows.${field}`);
    }
    expect(body).not.toContain("SELECT suggestion.*");
    expect(body).not.toContain("to_jsonb(page_rows)");
    expect(body).not.toContain("submitted_by_employee_id");
    expect(body).not.toContain("reviewed_by_employee_id");
    expect(behaviorSql).toContain("suggestion DTO exposed unexpected fields");
  });

  test("reviews without ever creating a catalog unit", () => {
    const body = functionBody("review_catalog_unit_suggestion");
    expect(body).toContain("public.assert_platform_catalog_actor(");
    expect(body).toContain("approved_unit.status = 'active'");
    expect(body).toContain("p_action = 'rejected'");
    expect(body).toContain("p_approved_catalog_unit_id IS NOT NULL");
    expect(body).not.toMatch(/INSERT INTO public\.catalog_units/i);
    expect(body).toContain("UPDATE public.catalog_unit_suggestions");
    expect(body).toContain("INSERT INTO public.supplier_command_events");
  });

  test("adds and exercises the bounded queue index", () => {
    expect(sql).toContain("catalog_unit_suggestions_v2_tenant_status_page_idx");
    expect(sql).toContain("tenant_id, status, created_at DESC, id DESC");
    expect(sql).toContain("pg_total_relation_size");
    expect(sql).toContain("reltuples");
    expect(sql).toContain("SUPPLIER_CATALOG_SUGGESTION_INDEX_TOO_LARGE");
    expect(sql).toMatch(
      /CREATE INDEX catalog_unit_suggestions_v2_tenant_status_page_idx\s+ON public\.catalog_unit_suggestions\(\s*tenant_id, status, created_at DESC, id DESC\s*\)/,
    );
    expect(behaviorSql).toContain("EXPLAIN (COSTS OFF)");
    expect(behaviorSql).toContain(
      "catalog_unit_suggestions_v2_tenant_status_page_idx' IN v_plan",
    );
  });
});
