import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260830114000_create_supplier_purchase_batch_workflow_review.sql",
  import.meta.url,
);

async function source() {
  return Bun.file(migration).text();
}

function functionBody(sql: string) {
  return sql.match(
    /CREATE FUNCTION public\.complete_supplier_purchase_batch_workflow_task\([\s\S]*?\$\$;/,
  )?.[0] ?? "";
}

describe("supplier purchase batch workflow review migration contract", () => {
  test("defines one service-role-only security definer RPC", async () => {
    const sql = await source();
    expect(sql).toContain(
      "CREATE FUNCTION public.complete_supplier_purchase_batch_workflow_task(",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.complete_supplier_purchase_batch_workflow_task(",
    );
    expect(sql).toContain(") FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain(") TO service_role;");
  });

  test("locks runtime and purchase facts in the documented order", async () => {
    const body = functionBody(await source());
    const instance = body.indexOf("FROM public.workflow_instances AS instance");
    const task = body.indexOf("FROM public.workflow_tasks AS task", instance);
    const batch = body.indexOf("FROM public.supplier_purchase_batches AS batch");
    const commitments = body.indexOf("FROM public.project_cost_commitments AS commitment");
    const requisitions = body.indexOf(
      "FROM public.supplier_purchase_requisitions AS requisition",
      commitments,
    );
    const orders = body.indexOf("FROM public.supplier_purchase_orders AS purchase_order");
    expect(instance).toBeGreaterThan(0);
    expect(task).toBeGreaterThan(instance);
    expect(batch).toBeGreaterThan(task);
    expect(commitments).toBeGreaterThan(batch);
    expect(requisitions).toBeGreaterThan(commitments);
    expect(orders).toBeGreaterThan(requisitions);
    expect(body.slice(instance, orders)).toContain("FOR UPDATE");
  });

  test("replays before mutation with an approval-round request fingerprint", async () => {
    const body = functionBody(await source());
    const replay = body.indexOf("FROM public.supplier_purchase_batch_command_events AS event");
    const firstMutation = Math.min(
      ...["UPDATE public.", "INSERT INTO public.", "DELETE FROM public."]
        .map((token) => body.indexOf(token))
        .filter((index) => index > 0),
    );
    expect(body).toContain("'task_id', p_task_id");
    expect(body).toContain("'action', v_action");
    expect(body).toContain("'reason', v_reason");
    expect(body).toContain("'output', v_output");
    expect(body).toContain("'approval_round', v_batch.approval_round");
    expect(body).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    expect(replay).toBeGreaterThan(0);
    expect(firstMutation).toBeGreaterThan(replay);
  });

  test("revalidates tenant task assignee permission project version round node and self review", async () => {
    const body = functionBody(await source());
    for (const token of [
      "v_task.tenant_id",
      "v_task.status <> 'pending'",
      "v_instance.current_node_key IS DISTINCT FROM v_task.node_key",
      "v_task.assignee_employee_id",
      "v_task.assignee_role_code",
      "v_task.assignee_permission_code",
      "__gooes_employee_has_project_permission_scope",
      "v_instance.context->>'batch_version'",
      "v_instance.context->>'approval_round'",
      "v_batch.submitted_by_employee_id = p_actor_employee_id",
      "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    ]) expect(body).toContain(token);
  });

  test("delegates final purchase mutations and keeps the four branches distinct", async () => {
    const body = functionBody(await source());
    expect(body).toContain("v_task.node_key = 'purchase_review'");
    expect(body).toContain("v_task.node_key = 'finance_review'");
    expect(body).toContain("v_batch.budget_status = 'within_budget'");
    expect(body).toContain("v_batch.budget_status = 'over_budget'");
    expect(body).toContain("public.review_supplier_purchase_batch(");
    expect(body.match(/public\.review_supplier_purchase_batch\(/g)).toHaveLength(1);
    expect(body).toContain("public.complete_workflow_instance_node(");
    expect(body).toContain("'decision', CASE v_action");
    expect(body).toContain("WHEN 'approve' THEN 'approved'");
    expect(body).toContain("ELSE 'rejected'");
    expect(body).toContain("v_review_result->>'status' = 'revision_required'");
    expect(body).toContain("status = 'canceled'");
    expect(body).not.toContain("convert_supplier_purchase_requisition_for_batch(");
    expect(body).not.toContain("submit_supplier_purchase_order(");
  });

  test("synchronizes subject state and emits workflow plus purchase audit", async () => {
    const body = functionBody(await source());
    expect(body).toContain("INSERT INTO public.workflow_subject_states");
    expect(body).toContain("INSERT INTO public.workflow_transition_logs");
    expect(body).toContain("public.record_supplier_purchase_batch_command_result(");
    expect(body).toContain("UPDATE public.supplier_purchase_batch_command_events AS event");
  });
});
