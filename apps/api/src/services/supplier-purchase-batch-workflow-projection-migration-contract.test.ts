import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const MIGRATION_URL = new URL(
  "../../../../supabase/migrations/20260830113500_list_supplier_purchase_batch_workflow_projection.sql",
  import.meta.url,
);

describe("supplier purchase batch workflow projection RPC migration", () => {
  test("runs transactionally with bounded migration locks", async () => {
    const sql = await readFile(MIGRATION_URL, "utf8");
    expect(sql).toStartWith("BEGIN;\nSET LOCAL lock_timeout = '5s';\n");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/Rollback: forward-fix/i);
    expect(sql.trimEnd()).toEndWith("COMMIT;");
  });

  test("filters tenant, subject ids, and assignee scope before ordering and limit", async () => {
    const sql = (await readFile(MIGRATION_URL, "utf8")).toLowerCase();
    const whereIndex = sql.indexOf("where task.tenant_id = p_tenant_id");
    const subjectTypeIndex = sql.indexOf(
      "instance.subject_type = p_subject_type",
    );
    const subjectIdsIndex = sql.indexOf(
      "instance.subject_id = any(v_subject_ids)",
    );
    const runningIndex = sql.indexOf("instance.status = 'running'");
    const currentNodeIndex = sql.indexOf(
      "instance.current_node_key = task.node_key",
    );
    const assigneeIndex = sql.indexOf("task.assignee_employee_id = p_employee_id");
    const orderIndex = sql.indexOf("order by task.created_at asc");
    const limitIndex = sql.indexOf("limit v_limit");

    expect(whereIndex).toBeGreaterThan(-1);
    expect(subjectTypeIndex).toBeGreaterThan(whereIndex);
    expect(subjectIdsIndex).toBeGreaterThan(subjectTypeIndex);
    expect(runningIndex).toBeGreaterThan(subjectIdsIndex);
    expect(currentNodeIndex).toBeGreaterThan(runningIndex);
    expect(assigneeIndex).toBeGreaterThan(currentNodeIndex);
    expect(orderIndex).toBeGreaterThan(assigneeIndex);
    expect(limitIndex).toBeGreaterThan(orderIndex);
    expect(sql).not.toContain("join public.employees");
    expect(sql).not.toContain("completed_by");
  });

  test("keeps the security definer RPC service-role-only", async () => {
    const sql = (await readFile(MIGRATION_URL, "utf8")).toLowerCase();
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
  });
});
