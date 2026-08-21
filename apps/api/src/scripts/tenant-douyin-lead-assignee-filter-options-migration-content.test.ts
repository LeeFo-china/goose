import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(import.meta.dir,
  "../../../../supabase/migrations/20260821105660_list_tenant_douyin_lead_assignee_filter_options.sql");
const fixMigrationPath = join(import.meta.dir,
  "../../../../supabase/migrations/20260821105670_fix_tenant_douyin_lead_assignee_filter_options.sql");
const aggregateFixMigrationPath = join(import.meta.dir,
  "../../../../supabase/migrations/20260821105680_fix_tenant_douyin_lead_assignee_filter_aggregate.sql");

describe("tenant douyin lead assignee filter options migration", () => {
  test("creates a strict service-role-only paginated RPC", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "public.list_tenant_douyin_lead_assignee_filter_options(",
    );
    expect(migration).toContain("p_visible_employee_ids uuid[]");
    expect(migration).toContain("RETURNS jsonb");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("p_page < 1 OR p_page > 10000");
    expect(migration).toContain("p_page_size < 1 OR p_page_size > 100");
    expect(migration).toContain("char_length(pg_catalog.btrim(p_keyword)) > 100");
    expect(migration).toContain("employee.tenant_id = p_tenant_id");
    expect(migration).toContain("employee.id = ANY(p_visible_employee_ids)");
    expect(migration).toContain("ORDER BY employee.name ASC NULLS LAST, employee.id ASC");
    expect(migration).toContain("OFFSET (p_page - 1) * p_page_size");
    expect(migration).toContain("LIMIT p_page_size");
    expect(migration).toContain("jsonb_build_object('list', v_list, 'total', v_total)");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO service_role");
  });

  test("keeps null as all and an empty visible id set as empty", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("p_visible_employee_ids IS NULL");
    expect(migration).toContain("array_position(p_visible_employee_ids, NULL)");
    expect(migration).not.toContain("employee.status = 'active'");
  });

  test("forward-fixes keyword normalization without rewriting applied history", () => {
    const migration = readFileSync(fixMigrationPath, "utf8");

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_tenant_douyin_lead_assignee_filter_options(",
    );
    expect(migration).toContain(
      "v_keyword := NULLIF(pg_catalog.btrim(p_keyword), '');",
    );
    expect(migration).not.toContain("pg_catalog.nullif");
  });

  test("forward-fixes empty-page aggregation without rewriting applied history", () => {
    const migration = readFileSync(aggregateFixMigrationPath, "utf8");

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.list_tenant_douyin_lead_assignee_filter_options(",
    );
    expect(migration).toContain("SELECT COALESCE(");
    expect(migration).not.toContain("pg_catalog.coalesce");
  });
});
