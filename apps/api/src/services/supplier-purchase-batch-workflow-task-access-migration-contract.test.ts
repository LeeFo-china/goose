import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const MIGRATION_URL = new URL(
  "../../../../supabase/migrations/20260830113700_fix_supplier_purchase_batch_workflow_task_pagination.sql",
  import.meta.url,
);
const SQL = existsSync(MIGRATION_URL)
  ? readFileSync(MIGRATION_URL, "utf8").toLowerCase()
  : "";

describe("supplier purchase batch workflow task access migration", () => {
  test("filters business scope before count, stable ordering, and bounded pagination", () => {
    const tenantIndex = SQL.indexOf("where task.tenant_id = p_tenant_id");
    const batchJoinIndex = SQL.indexOf(
      "join public.supplier_purchase_batches as batch",
    );
    const viewScopeIndex = SQL.indexOf(
      "batch.project_id = any(v_visible_project_ids)",
    );
    const selfReviewIndex = SQL.indexOf(
      "batch.submitted_by_employee_id is distinct from p_employee_id",
    );
    const assigneeIndex = SQL.indexOf(
      "task.assignee_employee_id = p_employee_id",
    );
    const countIndex = SQL.indexOf("count(*)::bigint as total_count");
    const orderIndex = SQL.indexOf(
      "order by accessible.updated_at desc, accessible.id desc",
    );
    const offsetIndex = SQL.indexOf("offset v_offset");
    const limitIndex = SQL.indexOf("limit v_page_size");

    expect(batchJoinIndex).toBeGreaterThan(-1);
    expect(tenantIndex).toBeGreaterThan(batchJoinIndex);
    expect(viewScopeIndex).toBeGreaterThan(tenantIndex);
    expect(selfReviewIndex).toBeGreaterThan(viewScopeIndex);
    expect(assigneeIndex).toBeGreaterThan(selfReviewIndex);
    expect(countIndex).toBeGreaterThan(-1);
    expect(orderIndex).toBeGreaterThan(assigneeIndex);
    expect(offsetIndex).toBeGreaterThan(orderIndex);
    expect(limitIndex).toBeGreaterThan(offsetIndex);
    expect(SQL).toContain("least(greatest(coalesce(p_page_size, 20), 1), 100)");
  });

  test("restricts pending tasks to the current running node", () => {
    expect(SQL.replace(/\s+/g, " ")).toContain(
      "v_status <> 'pending' or ( instance.status = 'running' and instance.current_node_key = task.node_key )",
    );
  });

  test("keeps the security definer RPC service-role-only", () => {
    expect(SQL).toStartWith("begin;\nset local lock_timeout = '5s';\n");
    expect(SQL).toContain("set search_path = pg_catalog, public");
    expect(SQL).toContain("security definer");
    expect(SQL).toContain("from public, anon, authenticated, service_role");
    expect(SQL).toContain("to service_role");
    expect(SQL.trimEnd()).toEndWith("commit;");
  });

  test("keeps mixed workflow pages supplier-safe before pagination", () => {
    expect(SQL).toContain(
      "function public.list_accessible_workflow_tasks_with_supplier_scope(",
    );
    expect(SQL).toContain("left join public.supplier_purchase_batches as batch");
    expect(SQL).toContain(
      "instance.subject_type <> 'supplier_purchase_batch'",
    );
    expect(SQL).toContain("p_supplier_access_allowed");
    expect(SQL).toContain(
      "batch.submitted_by_employee_id is distinct from p_supplier_employee_id",
    );
    expect(SQL).toContain(
      "batch.project_id = any(v_supplier_visible_project_ids)",
    );
    const mixedFunctionIndex = SQL.indexOf(
      "function public.list_accessible_workflow_tasks_with_supplier_scope(",
    );
    const mixedOrderIndex = SQL.indexOf(
      "order by accessible.updated_at desc, accessible.id desc",
      mixedFunctionIndex,
    );
    const mixedOffsetIndex = SQL.indexOf("offset v_offset", mixedFunctionIndex);
    expect(mixedOrderIndex).toBeGreaterThan(mixedFunctionIndex);
    expect(mixedOffsetIndex).toBeGreaterThan(mixedOrderIndex);
  });

  test("returns accurate totals for out-of-range pages without fake tasks", () => {
    expect(SQL).toContain("with accessible as materialized");
    expect(SQL).toContain("and not exists (select 1 from paged)");
    expect(SQL).toContain("null::uuid");
  });

  test("guards UUID conversion while retaining the batch primary-key lookup", () => {
    expect(SQL).toContain("batch.id = case");
    expect(SQL).toContain("then instance.subject_id::uuid");
    expect(SQL).toContain("else null::uuid");
    expect(SQL).not.toContain("batch.id::text");
  });
});
