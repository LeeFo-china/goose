import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migrationSql = () =>
  readFileSync(
    new URL(
      "../../../../supabase/migrations/20260714180000_project_operational_risk_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );

describe("project operational risk RPC migration contract", () => {
  test("creates a stable security-invoker paginated RPC with restricted execute permission", () => {
    const sql = migrationSql();
    const lowerSql = sql.toLowerCase();

    expect(lowerSql).toContain("get_project_operational_risk_page");
    expect(lowerSql).toContain("language sql");
    expect(lowerSql).toContain("stable");
    expect(lowerSql).toContain("security invoker");
    expect(lowerSql).toContain("set search_path = public");
    expect(lowerSql).not.toContain("security definer");

    expect(lowerSql).toContain("revoke all on function");
    expect(lowerSql).toContain("from public, anon, authenticated");
    expect(lowerSql).toContain("grant execute on function");
    expect(lowerSql).toContain("to service_role");
  });

  test("normalizes inputs without widening invalid filters", () => {
    const sql = migrationSql();

    expect(sql).toContain("least(greatest(coalesce(p_page_size, 20), 1), 100)");
    expect(sql).toContain("else '__invalid__'");
    expect(sql).toContain("nullif(left(btrim(coalesce(p_keyword, '')), 100), '')");
    expect(sql).toContain("pg_timezone_names");
    expect(sql).toContain("timezone(input.timezone_name, statement_timestamp())");
  });

  test("protects tenant scope, project status scope, diagnostics, and db pagination", () => {
    const sql = migrationSql();
    const tenantConstraintMatches = sql.match(/tenant_id\s*=\s*p_tenant_id/g) ?? [];
    const employeeTenantMatches = sql.match(/employees\.tenant_id\s*=\s*p_tenant_id/g) ?? [];

    expect(tenantConstraintMatches.length).toBeGreaterThanOrEqual(7);
    expect(employeeTenantMatches.length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("status <> 'invalid'");
    expect(sql).toContain("workflow_tasks_missing_due_at");
    expect(sql).toContain("offset ((select page - 1 from input) * (select page_size from input))");
    expect(sql).toContain("limit (select page_size from input)");
  });

  test("compares workflow task due times in an absolute time domain", () => {
    const sql = migrationSql();

    expect(sql).toContain("workflow_tasks.due_at < statement_timestamp()");
    expect(sql).not.toContain("workflow_tasks.due_at < normalized.local_now");
  });

  test("emits all risk families through union-all compatible risk facts", () => {
    const sql = migrationSql();
    const lowerSql = sql.toLowerCase();

    expect(lowerSql).toContain("union all");
    expect(sql).toContain("'workflow_task_overdue:'");
    expect(sql).toContain("'procedure_overdue:'");
    expect(sql).toContain("'missing_project_log:'");
    expect(sql).toContain("'acceptance_rework:'");
    expect(sql).toContain("'service_ticket:'");
    expect(lowerSql).not.toContain("select * from workflow_task_risks");
    expect(lowerSql).not.toContain("union all select *");

    for (const column of [
      "risk_key",
      "risk_type",
      "severity",
      "project_id",
      "project_name",
      "project_status",
      "source_type",
      "source_id",
      "assignee_employee_id",
      "assignee_employee_name",
      "occurred_at",
      "due_at",
      "overdue_days",
      "evidence",
    ]) {
      expect(sql).toContain(column);
    }
  });

  test("keeps sensitive source fields out of evidence", () => {
    const lowerSql = migrationSql().toLowerCase();

    expect(lowerSql).not.toContain("to_jsonb(");
    expect(lowerSql).not.toContain("reject_reason");
    expect(lowerSql).not.toContain(".phone");
    expect(lowerSql).not.toContain("avatar");
    expect(lowerSql).not.toContain("auth_user");
    expect(lowerSql).not.toContain("'content'");
    expect(lowerSql).not.toContain("'images'");
    expect(lowerSql).not.toContain("'customer_id'");
  });
});
