import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260830114000_create_supplier_purchase_batch_workflow_review.sql",
  import.meta.url,
);
const concurrencyScript = new URL(
  "../../../../supabase/tests/supplier_purchase_batch_workflow_review_concurrency.sh",
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

  test("acquires the legacy command and batch advisory locks before row locks", async () => {
    const body = functionBody(await source());
    const commandLock = body.indexOf("'supplier-purchase-batch-command:'");
    const batchLock = body.indexOf("'supplier-purchase-batch-id:'");
    const instance = body.indexOf("FROM public.workflow_instances AS instance");
    const task = body.indexOf("FROM public.workflow_tasks AS task", instance);
    const batch = body.indexOf("FROM public.supplier_purchase_batches AS batch");
    expect(commandLock).toBeGreaterThan(0);
    expect(batchLock).toBeGreaterThan(commandLock);
    expect(instance).toBeGreaterThan(batchLock);
    expect(instance).toBeGreaterThan(0);
    expect(task).toBeGreaterThan(instance);
    expect(batch).toBeGreaterThan(task);
    expect(body.slice(instance, batch + 200)).toContain("FOR UPDATE");
    expect(body.slice(0, instance)).toContain("6720240826142000");
  });

  test("leaves project budget and purchase fact locking to legacy review", async () => {
    const body = functionBody(await source());
    const legacyReview = body.indexOf(
      "v_review_result := public.review_supplier_purchase_batch(",
    );
    expect(legacyReview).toBeGreaterThan(0);
    const beforeLegacyReview = body.slice(0, legacyReview);
    expect(beforeLegacyReview).not.toContain(
      "FROM public.project_cost_commitments AS commitment",
    );
    expect(beforeLegacyReview).not.toContain(
      "FROM public.supplier_purchase_requisitions AS requisition",
    );
    expect(beforeLegacyReview).not.toContain(
      "FROM public.supplier_purchase_orders AS purchase_order",
    );
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
      "v_instance.context->>'submitted_by_employee_id'",
      "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    ]) expect(body).toContain(token);
  });

  test("delegates final purchase mutations and keeps the four branches distinct", async () => {
    const body = functionBody(await source());
    expect(body).toContain("v_task.node_key = 'purchase_review'");
    expect(body).toContain("v_task.node_key = 'finance_review'");
    expect(body).toContain(
      "v_instance.context->>'budget_status' = 'within_budget'",
    );
    expect(body).toContain(
      "v_instance.context->>'budget_status' = 'over_budget'",
    );
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

  test("asserts the exact runtime semantics for every business branch", async () => {
    const body = functionBody(await source());
    for (const token of [
      "v_expected_runtime_status := 'completed'",
      "v_expected_next_node_key := 'approved_end'",
      "v_expected_next_node_key := 'rejected_end'",
      "v_expected_runtime_status := 'running'",
      "v_expected_next_node_key := 'finance_review'",
      "v_runtime_result->'instance'->>'status' IS DISTINCT FROM",
      "v_runtime_result->'next_node'->>'node_key' IS DISTINCT FROM",
      "v_runtime_result->'task' IS DISTINCT FROM 'null'::jsonb",
      "v_runtime_result->'task'->>'node_key' IS DISTINCT FROM",
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
    ]) expect(body).toContain(token);
  });

  test("preserves the legacy fingerprint while storing the workflow replay fingerprint", async () => {
    const body = functionBody(await source());
    expect(body).toContain("v_legacy_fingerprint");
    expect(body).toContain("workflow_task_fingerprint");
    expect(body).toContain("event.request_fingerprint = v_legacy_fingerprint");
    expect(body).not.toContain("SET\n      request_fingerprint = v_fingerprint");
    expect(body).toContain("v_event.request->'workflow_task_result'");
    expect(body).toContain("'workflow_task_result', v_result");
    expect(body).not.toContain("result = v_result");
  });

  test("validates adopted legacy results by their persisted terminal state", async () => {
    const migration = await source();
    const body = functionBody(migration);
    expect(body).toContain("CASE v_review_result->>'status'");
    expect(body).toContain("WHEN 'ordered' THEN");
    expect(body).toMatch(
      /v_task\.node_key = 'purchase_review'[\s\S]*?v_instance\.context->>'budget_status'[\s\S]*?'within_budget'[\s\S]*?v_batch\.budget_status = 'within_budget'/,
    );
    expect(body).toMatch(
      /v_task\.node_key = 'finance_review'[\s\S]*?v_instance\.context->>'budget_status'[\s\S]*?'over_budget'[\s\S]*?v_batch\.budget_status = 'over_budget'/,
    );
    expect(body).toContain("WHEN 'revision_required' THEN");
    expect(body).toContain(
      "v_action <> 'approve'\n        OR v_batch.status <> 'draft'\n        OR v_batch.budget_status <> 'unchecked'",
    );
    expect(body).toContain(
      "WHEN 'rejected' THEN\n        v_action <> 'reject' OR v_batch.status <> 'rejected'",
    );
    expect(migration).toContain("Task 10 must ship in the same release");
  });

  test("synchronizes subject state and emits workflow plus purchase audit", async () => {
    const body = functionBody(await source());
    expect(body).toContain("INSERT INTO public.workflow_subject_states");
    expect(body).toContain("INSERT INTO public.workflow_transition_logs");
    expect(body).toContain("public.record_supplier_purchase_batch_command_result(");
    expect(body).toContain("UPDATE public.supplier_purchase_batch_command_events AS event");
  });

  test("coordinates concurrency cases through observable bounded lock handshakes", async () => {
    const script = await Bun.file(concurrencyScript).text();
    expect(script).not.toContain("sleep 0.2");
    expect(script).not.toContain("select pg_sleep(1)");
    expect(script).toContain("application_name");
    expect(script).toContain("pg_stat_activity");
    expect(script).toContain("pg_blocking_pids");
    expect(script).toContain("wait_for_blocked_by");
    expect(script).toContain("WAIT_ATTEMPTS");
    expect(script).toContain("models the production lock order");
  });
});
