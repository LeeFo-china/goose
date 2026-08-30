import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql",
  import.meta.url,
);
const concurrencyScript = new URL(
  "../../../../supabase/tests/supplier_purchase_batch_workflow_withdraw_concurrency.sh",
  import.meta.url,
);

async function source() {
  return Bun.file(migration).text();
}

function functionBody(sql: string, name: string) {
  return sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
  ))?.[0] ?? "";
}

describe("supplier purchase batch workflow withdraw migration contract", () => {
  test("defines a service-role-only security definer withdraw RPC", async () => {
    const sql = await source();
    expect(sql).toContain(
      "CREATE FUNCTION public.withdraw_supplier_purchase_batch_workflow(",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.withdraw_supplier_purchase_batch_workflow(",
    );
    expect(sql).toContain(") FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain(") TO service_role;");
  });

  test("replays before mutations and uses the canonical advisory lock order", async () => {
    const body = functionBody(
      (await source()).replace(
        "CREATE FUNCTION public.withdraw_supplier_purchase_batch_workflow(",
        "CREATE OR REPLACE FUNCTION public.withdraw_supplier_purchase_batch_workflow(",
      ),
      "withdraw_supplier_purchase_batch_workflow",
    );
    const commandLock = body.indexOf("'supplier-purchase-batch-command:'");
    const batchLock = body.indexOf("'supplier-purchase-batch-id:'");
    const replay = body.indexOf(
      "FROM public.supplier_purchase_batch_command_events AS event",
    );
    const instance = body.indexOf("FROM public.workflow_instances AS instance");
    const task = body.indexOf("FROM public.workflow_tasks AS task", instance);
    const batch = body.indexOf("FROM public.supplier_purchase_batches AS batch");
    const firstMutation = Math.min(
      ...["UPDATE public.", "INSERT INTO public.", "DELETE FROM public."]
        .map((token) => body.indexOf(token))
        .filter((index) => index > 0),
    );
    expect(commandLock).toBeGreaterThan(0);
    expect(batchLock).toBeGreaterThan(commandLock);
    expect(replay).toBeGreaterThan(batchLock);
    expect(instance).toBeGreaterThan(replay);
    expect(task).toBeGreaterThan(instance);
    expect(batch).toBeGreaterThan(task);
    expect(firstMutation).toBeGreaterThan(replay);
    expect(body).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
  });

  test("enforces submitter permission project scope version state and finance reason", async () => {
    const sql = await source();
    for (const token of [
      "supplier.purchase-requisition.manage",
      "project.update",
      "v_batch.submitted_by_employee_id",
      "v_batch.status <> 'pending_approval'",
      "v_batch.version <> p_expected_version",
      "v_instance.context->>'approval_round'",
      "v_batch.approval_round",
      "v_instance.current_node_key = 'finance_review'",
      "v_reason IS NULL",
      "SUPPLIER_PURCHASE_BATCH_WITHDRAW_REASON_REQUIRED",
      "SUPPLIER_PURCHASE_BATCH_WITHDRAW_NOT_ALLOWED",
    ]) expect(sql).toContain(token);
  });

  test("cancels workflow releases only reserved facts and preserves history", async () => {
    const sql = await source();
    for (const token of [
      "UPDATE public.workflow_tasks",
      "UPDATE public.workflow_instance_nodes",
      "UPDATE public.workflow_instances",
      "status = 'canceled'",
      "UPDATE public.project_cost_commitments",
      "commitment.status = 'reserved'",
      "status = 'released'",
      "UPDATE public.supplier_purchase_requisitions",
      "'status', 'withdrawn'",
      "UPDATE public.supplier_purchase_batches",
      "status = 'draft'",
      "version = batch.version + 1",
      "INSERT INTO public.workflow_transition_logs",
      "INSERT INTO public.workflow_subject_states",
      "'withdraw'",
    ]) expect(sql).toContain(token);
    expect(sql).not.toContain("DELETE FROM public.supplier_purchase_batch_items");
    expect(sql).not.toContain("DELETE FROM public.supplier_purchase_requisitions");
    expect(sql).not.toContain("DELETE FROM public.workflow_transition_logs");
  });

  test("forward-fixes rejected save and draft-or-rejected cancel boundaries", async () => {
    const sql = await source();
    const save = functionBody(sql, "save_supplier_purchase_batch_draft");
    const cancel = functionBody(sql, "cancel_supplier_purchase_batch");
    const complete = functionBody(
      sql,
      "complete_supplier_purchase_batch_workflow_task",
    );
    expect(save).toContain("v_batch.status NOT IN ('draft', 'rejected')");
    expect(save).toContain("status = 'draft'");
    expect(cancel).toContain("v_batch.status NOT IN ('draft', 'rejected')");
    expect(cancel).not.toContain("'pending_approval'");
    expect(complete.indexOf("'supplier-purchase-batch-command:'"))
      .toBeLessThan(complete.indexOf("AND event.command_type = 'review'"));
    expect(complete.indexOf("AND event.command_type = 'review'"))
      .toBeLessThan(complete.indexOf("SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE"));
  });

  test("coordinates double withdrawal with observable bounded locks", async () => {
    const script = await Bun.file(concurrencyScript).text();
    expect(script).toContain("pg_blocking_pids");
    expect(script).toContain("WAIT_ATTEMPTS");
    expect(script).toContain("task9_withdraw_gate");
    expect(script).toContain("withdraw-same-key");
    expect(script).toContain("withdraw-different-a");
    expect(script).toContain("withdraw-different-b");
    expect(script).not.toContain("sleep 1");
  });
});
