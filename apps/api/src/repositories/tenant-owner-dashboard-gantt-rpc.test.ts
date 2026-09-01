import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migrationSql = () =>
  readFileSync(
    new URL(
      "../../../../supabase/migrations/20260901110000_add_tenant_owner_project_gantt_filters.sql",
      import.meta.url,
    ),
    "utf8",
  );

describe("tenant owner project gantt RPC migration", () => {
  test("creates a restricted stable RPC with the complete filter contract", () => {
    const sql = migrationSql();
    const lowerSql = sql.toLowerCase();

    expect(lowerSql).toContain("list_tenant_owner_project_gantt");
    for (const parameter of [
      "p_tenant_id uuid",
      "p_page integer",
      "p_page_size integer",
      "p_keyword text",
      "p_window_start date",
      "p_window_end date",
      "p_timezone text",
      "p_risk text",
    ]) {
      expect(lowerSql).toContain(parameter);
    }
    expect(lowerSql).toContain("language sql");
    expect(lowerSql).toContain("stable");
    expect(lowerSql).toContain("security invoker");
    expect(lowerSql).toContain("revoke all on function");
    expect(lowerSql).toContain("to service_role");
  });

  test("filters tenant projects before count and stable pagination", () => {
    const sql = migrationSql().toLowerCase();

    expect(sql).toContain("projects.tenant_id = p_tenant_id");
    expect(sql).toContain("count(*)::bigint as total_count");
    expect(sql).toContain("order by filtered_projects.updated_at desc, filtered_projects.id desc");
    expect(sql).toContain("offset ((select page from valid_input) - 1) * (select page_size from valid_input)");
    expect(sql).toContain("limit (select page_size from valid_input)");
    expect(sql).toContain("from totals");
    expect(sql).toContain("left join paged_projects on true");
  });

  test("matches keyword, inclusive windows, and explainable workflow risks", () => {
    const sql = migrationSql().toLowerCase();

    for (const field of [
      "projects.name",
      "customers.name",
      "projects.address",
      "properties.community",
      "properties.building_info",
      "employees.name",
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toMatch(
      /coalesce\([\s\S]*planned_start_date,[\s\S]*planned_end_date[\s\S]*\) <= \(select window_end from valid_input\)/,
    );
    expect(sql).toMatch(
      /coalesce\([\s\S]*planned_end_date,[\s\S]*planned_start_date[\s\S]*\) >= \(select window_start from valid_input\)/,
    );
    expect(sql).toContain("assignment_status not in ('completed', 'canceled')");
    expect(sql).toContain("planned_end_date < (select business_date from valid_input)");
    expect(sql).toContain("node_status in ('current', 'pending')");
    expect(sql).toMatch(
      /planned_start_date is null[\s\S]*or[\s\S]*planned_end_date is null/,
    );
    expect(sql).toContain("trigger_acceptance");
    expect(sql).toContain("acceptance_status is distinct from 'customer_confirmed'");
  });

  test("adds bounded lookup indexes and documents rollback", () => {
    const sql = migrationSql().toLowerCase();

    expect(sql).toContain("idx_projects_tenant_status_updated_id");
    expect(sql).toContain("idx_project_procedure_assignments_gantt_filter");
    expect(sql).toContain("idx_project_members_gantt_owner");
    expect(sql).toContain("idx_project_acceptances_gantt_filter");
    expect(sql).toContain("-- rollback:");
  });
});
