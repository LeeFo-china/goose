import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/" +
    "20260830113000_create_supplier_purchase_batch_workflow_submit.sql",
);

function source(): string {
  return readFileSync(migrationPath, "utf8");
}

function functionBody(sql: string): string {
  const match = sql.match(
    /CREATE FUNCTION public\.submit_supplier_purchase_batch_with_workflow\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
  );
  if (!match?.[1]) throw new Error("workflow submit RPC missing");
  return match[1];
}

describe("supplier purchase batch workflow submit migration contract", () => {
  test("creates one locked-down atomic workflow submit RPC", () => {
    const sql = source();
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(
      /CREATE FUNCTION public\.submit_supplier_purchase_batch_with_workflow\(\s*p_batch_id uuid,\s*p_tenant_id uuid,\s*p_expected_version integer,\s*p_actor_user_id uuid,\s*p_actor_employee_id uuid,\s*p_idempotency_key text\s*\)/,
    );
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.submit_supplier_purchase_batch_with_workflow\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.submit_supplier_purchase_batch_with_workflow\([\s\S]*?TO service_role;/,
    );
    expect(sql.trimEnd()).toEndWith("COMMIT;");
  });

  test("checks replay before settings and batch locks", () => {
    const body = functionBody(source());
    const replay = body.indexOf(
      "FROM public.supplier_purchase_batch_command_events",
    );
    const settingsLock = body.indexOf(
      "FROM public.tenant_supplier_settings",
    );
    const batchLock = body.indexOf("FROM public.supplier_purchase_batches");
    expect(replay).toBeGreaterThan(0);
    expect(settingsLock).toBeGreaterThan(replay);
    expect(batchLock).toBeGreaterThan(settingsLock);
    expect(body).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
  });

  test("resolves the exact template and every context-reachable approval before submit", () => {
    const body = functionBody(source());
    const oldSubmit = body.indexOf("public.submit_supplier_purchase_batch(");
    expect(body).toContain("supplier_purchase_batch_approval");
    expect(body).toContain("within_budget");
    expect(body).toContain("over_budget");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_NO_APPROVER");
    expect(body.indexOf("SUPPLIER_PURCHASE_BATCH_NO_APPROVER"))
      .toBeLessThan(oldSubmit);
    expect(body).not.toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER");
    expect(body).not.toContain("v_purchase_node");
    expect(body).not.toContain("v_finance_node");
    expect(body).toContain("__gooes_supplier_workflow_reachable_approvals");
    expect(body).toContain("__gooes_workflow_node_has_candidate");
    expect(body).toContain("__gooes_supplier_purchase_batch_budget_preflight");
  });

  test("shares authoritative task projection and project-scoped candidate semantics", () => {
    const sql = source();
    const projection = sql.match(
      /CREATE FUNCTION public\.__gooes_workflow_task_projection\([\s\S]*?\$\$;/,
    )?.[0] ?? "";
    const taskTrigger = sql.match(
      /CREATE OR REPLACE FUNCTION public\.set_workflow_task_assignee_permission\(\)[\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(sql).toContain("CREATE FUNCTION public.__gooes_workflow_task_projection");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_workflow_task_assignee_permission");
    expect(taskTrigger.match(/public\.__gooes_workflow_task_projection\(/g))
      .toHaveLength(1);
    expect(taskTrigger).not.toContain("applicant_department_manager");
    expect(taskTrigger).not.toContain("finance_reviewer_employee_id");
    for (const rule of [
      "'employee'",
      "'role'",
      "'applicant_department_manager'",
      "'expense_request'",
      "'payment_collection'",
    ]) expect(projection).toContain(rule);
    expect(sql).toContain("employee.status = 'active'");
    expect(sql).toContain("employee.id <> p_submitter_employee_id");
    expect(sql).toContain("project_members");
    expect(sql).toContain("tenant_department_id");
    expect(sql).toContain("employee_permission_overrides");
    expect(sql).toContain("role_permissions");
  });

  test("strict graph walker handles custom branches and rejects unsafe graphs", () => {
    const sql = source();
    const walker = sql.match(
      /CREATE FUNCTION public\.__gooes_supplier_workflow_reachable_approvals\([\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(walker).toContain("budget_status");
    expect(walker).toContain("decision");
    expect(walker).toContain("graph_ambiguous");
    expect(walker).toContain("graph_cycle");
    expect(walker).toContain("condition_indeterminate");
    expect(walker).toContain("node_type' = 'approval");
    expect(walker).toContain("next_decision.decision");
    expect(walker.match(/AS next_decision\(decision\)/g)).toHaveLength(3);
    expect(walker).not.toContain("purchase_review");
    expect(walker).not.toContain("finance_review");
  });

  test("preflights budget and every approver before the legacy submit", () => {
    const body = functionBody(source());
    const budget = body.indexOf("__gooes_supplier_purchase_batch_budget_preflight(");
    const approvals = body.indexOf("__gooes_supplier_workflow_reachable_approvals(");
    const candidates = body.indexOf("__gooes_workflow_node_has_candidate(");
    const oldSubmit = body.indexOf("public.submit_supplier_purchase_batch(");
    expect(budget).toBeGreaterThan(0);
    expect(approvals).toBeGreaterThan(budget);
    expect(candidates).toBeGreaterThan(approvals);
    expect(oldSubmit).toBeGreaterThan(candidates);
    expect(body.slice(oldSubmit)).not.toContain(
      "__gooes_workflow_node_has_candidate(",
    );
    const postSubmit = body.slice(oldSubmit);
    expect(postSubmit).toContain(
      "v_batch.budget_status IS DISTINCT FROM",
    );
    expect(postSubmit).toContain(
      "v_batch.budget_snapshot IS DISTINCT FROM",
    );
    expect(postSubmit).toContain(
      "v_budget_preflight->'budget_snapshot'",
    );
    expect(postSubmit).toContain(
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
    );
  });

  test("pins legacy lock order and every budget fact used by preflight", () => {
    const sql = source();
    const preflight = sql.match(
      /CREATE FUNCTION public\.__gooes_supplier_purchase_batch_budget_preflight\([\s\S]*?\$\$;/,
    )?.[0] ?? "";
    const relationship = preflight.indexOf("FROM public.tenant_suppliers");
    const pricePublish = preflight.indexOf("supplier-price-publish:");
    const budgetScope = preflight.indexOf("lock_project_cost_budget_scope");
    expect(relationship).toBeGreaterThan(0);
    expect(pricePublish).toBeGreaterThan(relationship);
    expect(budgetScope).toBeGreaterThan(pricePublish);
    expect(preflight).toContain("FROM public.finance_cost_categories");
    expect(preflight).toContain("FROM public.project_cost_budgets");
    expect(preflight).toContain("FROM public.project_cost_commitments");
    expect(preflight.match(/FOR UPDATE/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  test("delegates old submission then starts and projects workflow atomically", () => {
    const body = functionBody(source());
    expect(body.match(/public\.submit_supplier_purchase_batch\(/g)).toHaveLength(1);
    expect(body).toContain("approval_round = batch.approval_round + 1");
    expect(body).toContain("public.start_workflow_instance(");
    expect(body).toContain("'supplier_purchase_batch'");
    for (const key of [
      "batch_id",
      "batch_version",
      "approval_round",
      "budget_status",
      "project_id",
      "submitted_by_employee_id",
    ]) {
      expect(body).toContain(`'${key}'`);
    }
    expect(body).toContain("INSERT INTO public.workflow_subject_states");
    expect(body).toContain("ON CONFLICT (tenant_id, subject_type, subject_id)");
    expect(body).toContain("workflow_state");
    expect(body).toContain("requisition_ids");
    expect(body).toContain("idempotent");
  });
});
