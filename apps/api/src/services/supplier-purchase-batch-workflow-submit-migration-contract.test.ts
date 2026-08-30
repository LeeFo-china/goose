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

  test("validates the exact template, required nodes, and approvers before submit", () => {
    const body = functionBody(source());
    const oldSubmit = body.indexOf("public.submit_supplier_purchase_batch(");
    expect(body).toContain("supplier_purchase_batch_approval");
    expect(body).toContain("purchase_review");
    expect(body).toContain("finance_review");
    expect(body).toContain("within_budget");
    expect(body).toContain("over_budget");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
    expect(body).toContain("SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER");
    expect(body.indexOf("SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER"))
      .toBeLessThan(oldSubmit);
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
