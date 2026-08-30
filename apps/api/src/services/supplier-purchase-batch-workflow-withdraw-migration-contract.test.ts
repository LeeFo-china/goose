import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql",
  import.meta.url,
);
const concurrencyScript = new URL(
  "../../../../supabase/tests/supplier_purchase_batch_workflow_withdraw_concurrency.sh",
  import.meta.url,
);
const productionIntegrationScript = new URL(
  "../../../../supabase/tests/supplier_purchase_batch_workflow_withdraw_production_integration.sh",
  import.meta.url,
);
const reviewCompatProductionFixture = new URL(
  "../../../../supabase/tests/supplier_purchase_batch_workflow_review_compat_production_fixture.sql",
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
    expect(save).toContain("reviewed_by_employee_id = NULL");
    expect(save).toContain(
      "reviewed_by_employee_id = v_batch.reviewed_by_employee_id",
    );
    expect(cancel).toContain("v_batch.status NOT IN ('draft', 'rejected')");
    expect(cancel).not.toContain("'pending_approval'");
    expect(cancel).toContain("reviewed_by_employee_id = NULL");
    expect(cancel).toContain(
      "reviewed_by_employee_id = v_batch.reviewed_by_employee_id",
    );
    expect(complete.indexOf("'supplier-purchase-batch-command:'"))
      .toBeLessThan(complete.indexOf("AND event.command_type = 'review'"));
    expect(complete.indexOf("AND event.command_type = 'review'"))
      .toBeLessThan(complete.indexOf("SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE"));
  });

  test("replays a completed old-round workflow task from its frozen request", async () => {
    const complete = functionBody(
      await source(),
      "complete_supplier_purchase_batch_workflow_task",
    );
    const eventRead = complete.indexOf("INTO v_event");
    const frozenRound = complete.indexOf(
      "v_workflow_request->>'approval_round'",
    );
    const replayFingerprint = complete.indexOf(
      "v_current_canonical_request := pg_catalog.jsonb_set",
    );
    const directReplay = complete.indexOf(
      "v_event.request->'workflow_task_result'",
    );
    const stale = complete.indexOf(
      "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    );
    expect(eventRead).toBeGreaterThan(0);
    expect(complete.slice(eventRead, frozenRound)).toContain("FOR UPDATE");
    expect(frozenRound).toBeGreaterThan(eventRead);
    expect(replayFingerprint).toBeGreaterThan(frozenRound);
    expect(directReplay).toBeGreaterThan(replayFingerprint);
    expect(stale).toBeGreaterThan(directReplay);
    expect(complete).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
  });

  test("canonicalizes trusted legacy compatibility metadata for cross-route replay", async () => {
    const complete = functionBody(
      await source(),
      "complete_supplier_purchase_batch_workflow_task",
    );
    for (const token of [
      "v_stored_fingerprint",
      "v_stored_canonical_request",
      "v_current_canonical_request",
      "compat_source",
      "compat_expected_version",
      "instance.context->>'batch_version'",
      "v_task_batch_version",
      "v_event.request->>'workflow_task_fingerprint'",
      "v_stored_canonical_request IS DISTINCT FROM",
      "v_current_canonical_request",
    ]) expect(complete).toContain(token);
    expect(complete).toMatch(
      /COALESCE\(v_workflow_request->'output', '\{\}'::jsonb\)\s*-\s*'compat_source'\s*-\s*'compat_expected_version'/,
    );
    expect(complete).toMatch(
      /COALESCE\(v_replay_request->'output', '\{\}'::jsonb\)\s*-\s*'compat_source'\s*-\s*'compat_expected_version'/,
    );
  });

  test("rejects invalid reserved compatibility metadata before first execution", async () => {
    const complete = functionBody(
      await source(),
      "complete_supplier_purchase_batch_workflow_task",
    );
    const eventRead = complete.indexOf("INTO v_event");
    const reservedValidation = complete.indexOf(
      "v_current_output ? 'compat_source'",
    );
    const delegate = complete.lastIndexOf(
      "__gooes_complete_supplier_purchase_batch_workflow_task_v1",
    );
    expect(eventRead).toBeGreaterThan(0);
    expect(reservedValidation).toBeGreaterThan(eventRead);
    expect(delegate).toBeGreaterThan(reservedValidation);
    expect(complete).toContain("^[1-9][0-9]*$");
    expect(complete).toContain(
      "v_current_compat_version IS DISTINCT FROM v_task_batch_version",
    );
  });

  test("serializes event replay, stale preflight, and v1 delegation behind the batch lock", async () => {
    const complete = functionBody(
      await source(),
      "complete_supplier_purchase_batch_workflow_task",
    );
    const commandLock = complete.indexOf("'supplier-purchase-batch-command:'");
    const batchLock = complete.indexOf("'supplier-purchase-batch-id:'");
    const eventRead = complete.indexOf("INTO v_event");
    const stale = complete.indexOf(
      "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    );
    const delegate = complete.lastIndexOf(
      "__gooes_complete_supplier_purchase_batch_workflow_task_v1",
    );
    expect(commandLock).toBeGreaterThan(0);
    expect(batchLock).toBeGreaterThan(commandLock);
    expect(eventRead).toBeGreaterThan(batchLock);
    expect(stale).toBeGreaterThan(eventRead);
    expect(delegate).toBeGreaterThan(stale);
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

  test("runs the real production-schema save submit review withdraw resubmit chain", async () => {
    const script = await Bun.file(productionIntegrationScript).text();
    expect(script).toContain("pg_dump");
    expect(script).toContain("--schema-only");
    expect(script).toContain(
      "20260830113000_create_supplier_purchase_batch_workflow_submit.sql",
    );
    expect(script).toContain(
      "supplier_purchase_batch_workflow_withdraw_production_fixture.sql",
    );
    expect(script).toContain("dropdb");
    expect(script).not.toContain("approval_round=2");
    expect(script).not.toContain("SET approval_round");
  });

  test("runs direct and legacy review compatibility against production schema", async () => {
    const script = await Bun.file(productionIntegrationScript).text();
    const fixture = await Bun.file(reviewCompatProductionFixture).text();
    expect(script).toContain(
      "supplier_purchase_batch_workflow_review_compat_production_fixture.sql",
    );
    for (const token of [
      "production-compat-direct-first",
      "production-compat-legacy-first",
      "production-compat-invalid-source",
      "production-compat-invalid-version",
      "production-compat-single-field",
      "compat_expected_version', 3",
      "SUPPLIER_IDEMPOTENCY_CONFLICT",
      "WORKFLOW_TASK_NOT_PENDING",
      "production-compat-reject",
    ]) expect(fixture).toContain(token);
  });

  test("blocks an old task behind a real withdrawal and resubmission round update", async () => {
    const script = await Bun.file(productionIntegrationScript).text();
    for (const token of [
      "task9_production_round_writer",
      "task9_production_old_task_completion",
      "task9_production_round_gate",
      "pg_blocking_pids",
      "withdraw_supplier_purchase_batch_workflow",
      "submit_supplier_purchase_batch_with_workflow",
      "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
    ]) expect(script).toContain(token);
    expect(script).not.toContain("sleep 1");
  });
});
