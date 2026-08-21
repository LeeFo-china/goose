import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(import.meta.dir,
  "../../../../supabase/migrations/20260821105690_list_tenant_douyin_leads.sql");

describe("tenant Douyin lead list migration", () => {
  test("creates a strict service-role-only paginated POST RPC", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("public.list_tenant_douyin_leads(");
    expect(sql).toContain("p_visible_assignee_ids uuid[]");
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toContain("lead.source = 'douyin_miniapp'");
    expect(sql).toContain("p_page < 1 OR p_page > 10000");
    expect(sql).toContain("p_page_size < 1 OR p_page_size > 100");
    expect(sql).toContain("p_status NOT IN");
    expect(sql).toContain("p_date_from >= p_date_to_exclusive");
    expect(sql).toContain("array_position(p_visible_assignee_ids, NULL)");
    expect(sql).toContain("char_length(v_keyword) > 80");
    expect(sql).toContain("lead.assigned_employee_id = ANY(p_visible_assignee_ids)");
    expect(sql).toContain("ORDER BY lead.created_at DESC, lead.id DESC");
    expect(sql).toContain("OFFSET (p_page - 1) * p_page_size");
    expect(sql).toContain("LIMIT p_page_size");
    expect(sql).toContain("jsonb_build_object('list', v_list, 'total', v_total)");
    expect(sql).not.toContain("form_data");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(sql).toContain("TO service_role");
  });
});
