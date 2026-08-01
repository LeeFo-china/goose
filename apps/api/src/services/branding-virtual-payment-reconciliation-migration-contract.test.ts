import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationSql = readFileSync(resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260801102000_create_branding_virtual_payment_reconciliation.sql",
), "utf8");

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")").trim().toLowerCase();
}

function extractFunction(sql: string, functionName: string): string {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
    "i",
  ))?.[0] ?? "";
}

describe("branding virtual payment reconciliation migration", () => {
  test("adds full official-status audit and separates delivery identities", () => {
    const normalized = normalizeSql(migrationSql);

    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalized).toMatch(/\bbegin;[\s\S]*commit;$/);
    expect(normalized).toContain(
      "reconcile_last_provider_status between 0 and 10",
    );
    expect(normalized).toContain("provider_delivery_attempt_key uuid");
    expect(normalized).toContain("provider_delivery_request_id text");
    expect(normalized).toContain("provider_delivery_provided_at timestamptz");
    expect(normalized).toContain("reconcile_query_provider_order_no text");
    expect(normalized).toContain("reconcile_query_transaction_id text");
    expect(normalized).toContain("reconcile_query_paid_amount_fen integer");
    expect(normalized).toContain("reconcile_query_paid_at timestamptz");
    expect(normalized).toContain("reconcile_completion_kind text");
    expect(normalized).toContain(
      "reconcile_completion_kind in ('query', 'grant_recovery')",
    );
    expect(normalized).toContain(
      "reconcile_last_provider_status in (2, 3, 4) and reconcile_query_provider_order_no is not null",
    );
    expect(normalized).toContain(
      "reconcile_completion_kind = 'query' and reconcile_last_provider_status in (2, 3, 4)",
    );
    expect(normalized).toContain(
      "reconcile_completion_kind = 'grant_recovery' and reconcile_last_provider_status is null",
    );
    expect(normalized).toMatch(
      /tenant_virtual_addon_orders_reconcile_completion_state_check check \([\s\S]*?\) is true\), add constraint tenant_virtual_addon_orders_reconcile_query_audit_check/,
    );
    expect(normalized).toMatch(
      /tenant_virtual_addon_orders_reconcile_query_audit_check check \([\s\S]*?\) is true\), add constraint tenant_virtual_addon_orders_delivery_status_check/,
    );
    expect(normalized).toContain(
      "provider_delivery_status in ('not_required', 'pending', 'succeeded', 'failed')",
    );
    expect(normalized).toContain(
      "provider_delivery_status = 'pending' and provider_delivery_attempt_key is not null and provider_delivery_request_id is null",
    );
    expect(normalized).toContain(
      "char_length(provider_delivery_request_id) <= 128",
    );
  });

  test("schedules only actually due work and returns minimal worker facts", () => {
    const normalized = normalizeSql(migrationSql);
    const scheduling = normalizeSql(extractFunction(
      migrationSql,
      "schedule_tenant_virtual_addon_order_reconciliation",
    ));
    const claim = normalizeSql(extractFunction(
      migrationSql,
      "branding_claim_virtual_payment_reconciliation_batch",
    ));

    expect(normalized).toContain("add column reconcile_next_at timestamptz null");
    expect(normalized).not.toContain(
      "add column reconcile_next_at timestamptz null default now()",
    );
    expect(scheduling).toMatch(
      /payment_request_issued_at is not null[\s\S]*new\.reconcile_next_at := new\.payment_expires_at/,
    );
    expect(scheduling).toMatch(
      /fulfillment_status = 'grant_failed'[\s\S]*old\.fulfillment_status is distinct from new\.fulfillment_status[\s\S]*new\.reconcile_next_at := clock_timestamp\(\)/,
    );
    expect(scheduling).toMatch(
      /payment_status = 'succeeded'[\s\S]*fulfillment_status = 'granted'[\s\S]*provider_delivery_status = 'not_required'[\s\S]*reconcile_completion_kind is not null[\s\S]*new\.reconcile_next_at := coalesce/,
    );
    expect(normalized).toContain(
      "set reconcile_next_at = payment_expires_at where payment_status = 'pending' and payment_request_issued_at is not null",
    );
    expect(claim).toContain("for update skip locked");
    expect(claim).toContain(
      "least(greatest(coalesce(p_limit, 20), 1), 100)",
    );
    expect(claim).toContain(
      "least(greatest(coalesce(p_lease_seconds, 120), 30), 600)",
    );
    expect(claim).toContain(
      "orders.payment_status = 'pending' and orders.payment_expires_at <= v_now and orders.payment_request_issued_at is not null",
    );
    expect(claim).toContain(
      "orders.payment_status = 'succeeded' and orders.fulfillment_status = 'granted' and orders.provider_delivery_status = 'not_required' and orders.reconcile_completion_kind is not null",
    );
    const returned = claim.slice(claim.lastIndexOf("returning"));
    for (const fact of [
      "orders.id",
      "orders.out_trade_no",
      "orders.provider_order_no",
      "orders.transaction_id",
      "orders.paid_amount_fen",
      "orders.paid_at",
      "orders.reconcile_claim_token",
      "orders.reconcile_completion_kind",
      "orders.reconcile_query_provider_order_no",
      "orders.reconcile_query_transaction_id",
      "orders.reconcile_query_paid_amount_fen",
      "orders.reconcile_query_paid_at",
    ]) {
      expect(returned).toContain(fact);
    }
    for (const unnecessary of [
      "orders.idempotency_key",
      "orders.order_no",
      "orders.product_name",
      "orders.purchase_notes",
      "orders.refund_policy",
      "orders.created_by",
    ]) {
      expect(returned).not.toContain(unnecessary);
    }
  });

  test("prepares a durable successful-query checkpoint without confirming payment", () => {
    const prepare = normalizeSql(extractFunction(
      migrationSql,
      "branding_prepare_successful_query_reconciliation",
    ));

    expect(prepare).toContain("p_official_status not in (2, 3, 4)");
    expect(prepare).toContain("v_order.payment_status <> 'pending'");
    expect(prepare).toContain("v_order.payment_request_issued_at is null");
    expect(prepare).toContain("v_order.payment_expires_at > v_now");
    for (const binding of [
      "v_order.environment is distinct from p_environment",
      "v_order.payer_openid is distinct from p_openid",
      "v_order.out_trade_no is distinct from p_out_trade_no",
      "v_order.provider_product_id is distinct from p_provider_product_id",
      "p_quantity <> 1",
      "p_orig_price_fen <> v_order.amount_fen",
      "p_actual_price_fen <> v_order.amount_fen",
      "p_attach is distinct from v_order.id::text",
    ]) {
      expect(prepare).toContain(binding);
    }
    expect(prepare).toContain(
      "reconcile_last_provider_status = p_official_status",
    );
    expect(prepare).toContain("reconcile_completion_kind = 'query'");
    expect(prepare).toContain(
      "v_order.reconcile_completion_kind is not null and v_order.reconcile_completion_kind <> 'query'",
    );
    expect(prepare).toContain(
      "reconcile_query_provider_order_no = p_provider_order_no",
    );
    expect(prepare).toContain(
      "reconcile_query_transaction_id = p_transaction_id",
    );
    expect(prepare).toContain(
      "reconcile_query_paid_amount_fen = p_actual_price_fen",
    );
    expect(prepare).toContain("reconcile_query_paid_at = p_paid_at");
    expect(prepare).toContain(
      "reconcile_next_at = coalesce(orders.reconcile_next_at, v_now)",
    );
    expect(prepare).not.toContain("set payment_status = 'succeeded'");
    expect(prepare).not.toMatch(/\bprovider_order_no\s*=\s*p_provider_order_no/);
    expect(prepare).not.toMatch(/\btransaction_id\s*=\s*p_transaction_id/);
    expect(prepare).not.toMatch(/\bpaid_amount_fen\s*=\s*p_actual_price_fen/);
    expect(prepare).not.toMatch(/\bpaid_at\s*=\s*p_paid_at/);
    expect(prepare).not.toContain("branding_confirm_virtual_addon_purchase");
    expect(prepare).not.toContain("tenant_entitlements");
    expect(prepare).toContain(
      "branding_virtual_reconciliation_facts_mismatch",
    );
    for (const conflict of [
      "v_order.reconcile_last_provider_status is distinct from p_official_status",
      "v_order.reconcile_query_provider_order_no is distinct from p_provider_order_no",
      "v_order.reconcile_query_transaction_id is distinct from p_transaction_id",
      "v_order.reconcile_query_paid_amount_fen is distinct from p_actual_price_fen",
      "v_order.reconcile_query_paid_at is distinct from p_paid_at",
    ]) {
      expect(prepare).toContain(conflict);
    }
  });

  test("finalizes query and grant recovery only after application confirmation", () => {
    const finalize = normalizeSql(extractFunction(
      migrationSql,
      "branding_finalize_virtual_payment_reconciliation",
    ));

    expect(finalize).not.toContain("branding_confirm_virtual_addon_purchase");
    expect(finalize).not.toContain("tenant_entitlements");
    expect(finalize).not.toContain("tenant_entitlement_events");
    expect(finalize).toContain(
      "p_official_status is not null and p_official_status not in (2, 3, 4)",
    );
    expect(finalize).toContain("v_order.payment_status <> 'succeeded'");
    expect(finalize).toContain("v_order.fulfillment_status <> 'granted'");
    for (const fact of [
      "v_order.reconcile_last_provider_status is distinct from p_official_status",
      "v_order.reconcile_query_provider_order_no is distinct from p_provider_order_no",
      "v_order.reconcile_query_transaction_id is distinct from p_transaction_id",
      "v_order.reconcile_query_paid_amount_fen is distinct from p_paid_amount_fen",
      "v_order.reconcile_query_paid_at is distinct from p_paid_at",
      "v_order.provider_order_no is distinct from p_provider_order_no",
      "v_order.transaction_id is distinct from p_transaction_id",
      "v_order.paid_amount_fen is distinct from p_paid_amount_fen",
      "v_order.paid_at is distinct from p_paid_at",
    ]) {
      expect(finalize).toContain(fact);
    }
    const statusTwoBranch = finalize.slice(
      finalize.indexOf("if p_official_status = 2 then"),
      finalize.indexOf("else update", finalize.indexOf("if p_official_status = 2 then")),
    );
    const alreadyDeliveredBranch = finalize.slice(
      finalize.indexOf("else update", finalize.indexOf("if p_official_status = 2 then")),
      finalize.indexOf("end if", finalize.indexOf("else update", finalize.indexOf("if p_official_status = 2 then"))),
    );
    expect(statusTwoBranch).toContain("provider_delivery_status = 'pending'");
    expect(statusTwoBranch).toContain(
      "provider_delivery_attempt_count = orders.provider_delivery_attempt_count + 1",
    );
    expect(statusTwoBranch).toContain("provider_delivery_request_id = null");
    expect(finalize).not.toContain("gen_random_uuid()");
    expect(finalize).toContain("provider_delivery_attempt_key = p_delivery_attempt_key");
    expect(finalize).toContain("provider_delivery_request_id = null");
    expect(alreadyDeliveredBranch).toContain(
      "provider_delivery_status = 'succeeded'",
    );
    expect(alreadyDeliveredBranch).toContain(
      "provider_delivery_provided_at = v_now",
    );
    expect(alreadyDeliveredBranch).not.toContain(
      "provider_delivery_attempt_count =",
    );
    const grantRecoveryBranch = finalize.slice(
      finalize.indexOf("if p_official_status is null then"),
      finalize.indexOf("else", finalize.indexOf("if p_official_status is null then")),
    );
    expect(grantRecoveryBranch).toContain(
      "v_order.reconcile_last_provider_status is not null",
    );
    expect(grantRecoveryBranch).toContain(
      "v_order.reconcile_completion_kind is distinct from 'grant_recovery'",
    );
    expect(grantRecoveryBranch).toContain(
      "v_order.provider_delivery_status <> 'not_required'",
    );
    expect(grantRecoveryBranch).toContain("reconcile_next_at = null");
    expect(grantRecoveryBranch).toContain("reconcile_claim_token = null");
    expect(grantRecoveryBranch).not.toContain("provider_delivery_status =");
    expect(finalize).toContain(
      "v_order.reconcile_completion_kind is distinct from 'query'",
    );
    expect(finalize).toContain("reconcile_completion_kind = null");
  });

  test("keeps both confirmation crash windows reclaimable", () => {
    const normalized = normalizeSql(migrationSql);
    const scheduling = normalizeSql(extractFunction(
      migrationSql,
      "schedule_tenant_virtual_addon_order_reconciliation",
    ));
    const claim = normalizeSql(extractFunction(
      migrationSql,
      "branding_claim_virtual_payment_reconciliation_batch",
    ));
    const dueIndex = normalized.slice(
      normalized.indexOf("create index tenant_virtual_addon_orders_reconciliation_due_idx"),
      normalized.indexOf("create function public.branding_claim_virtual_payment_reconciliation_batch"),
    );

    expect(scheduling).toContain(
      "new.provider_delivery_status = 'not_required' and new.reconcile_completion_kind is not null",
    );
    expect(claim).toContain(
      "orders.reconcile_claim_token is null or orders.reconcile_claim_expires_at <= v_now",
    );
    expect(claim).toContain(
      "orders.provider_delivery_status = 'not_required' and orders.reconcile_completion_kind is not null",
    );
    expect(dueIndex).toContain(
      "provider_delivery_status = 'not_required' and reconcile_completion_kind is not null",
    );
    expect(dueIndex).not.toContain(
      "provider_delivery_status = 'not_required' and reconcile_claim_token is not null",
    );
    expect(claim).toContain(
      "reconcile_completion_kind = case when orders.payment_status = 'succeeded' and orders.fulfillment_status = 'grant_failed' then coalesce(orders.reconcile_completion_kind, 'grant_recovery') else orders.reconcile_completion_kind end",
    );
    expect(claim).toContain(
      "orders.payment_status = 'pending' and orders.payment_expires_at <= v_now",
    );
    expect(scheduling).toMatch(
      /provider_delivery_status = 'not_required'[\s\S]*reconcile_completion_kind is not null[\s\S]*else new\.reconcile_next_at := null/,
    );
  });

  test("normalizes a status-5 grant failure without aborting its claim batch", () => {
    const scheduling = normalizeSql(extractFunction(
      migrationSql,
      "schedule_tenant_virtual_addon_order_reconciliation",
    ));
    const reschedule = normalizeSql(extractFunction(
      migrationSql,
      "branding_reschedule_virtual_payment_reconciliation",
    ));
    const claim = normalizeSql(extractFunction(
      migrationSql,
      "branding_claim_virtual_payment_reconciliation_batch",
    ));
    const recoveryFromUnmarkedGrantFailure =
      "orders.payment_status = 'succeeded' and orders.fulfillment_status = 'grant_failed' and orders.reconcile_completion_kind is null";

    expect(reschedule).toContain(
      "p_official_status is not null and p_official_status not between 0 and 10",
    );
    expect(reschedule).toContain(
      "when orders.reconcile_completion_kind is null then p_official_status",
    );
    expect(scheduling).toMatch(
      /fulfillment_status = 'grant_failed'[\s\S]*new\.reconcile_next_at := clock_timestamp\(\)/,
    );
    for (const audit of [
      "reconcile_last_provider_status",
      "reconcile_query_provider_order_no",
      "reconcile_query_transaction_id",
      "reconcile_query_paid_amount_fen",
      "reconcile_query_paid_at",
    ]) {
      expect(claim).toContain(
        `${audit} = case when ${recoveryFromUnmarkedGrantFailure} then null else orders.${audit} end`,
      );
    }
    expect(claim).toContain(
      "reconcile_completion_kind = case when orders.payment_status = 'succeeded' and orders.fulfillment_status = 'grant_failed' then coalesce(orders.reconcile_completion_kind, 'grant_recovery') else orders.reconcile_completion_kind end",
    );
    expect(claim).toContain(
      "from candidates where orders.id = candidates.id returning",
    );
  });

  test("reschedule preserves completion checkpoints across lease release", () => {
    const reschedule = normalizeSql(extractFunction(
      migrationSql,
      "branding_reschedule_virtual_payment_reconciliation",
    ));

    expect(reschedule).toContain(
      "v_order.reconcile_completion_kind = 'query'",
    );
    expect(reschedule).toContain(
      "p_official_status is not null and p_official_status is distinct from v_order.reconcile_last_provider_status",
    );
    expect(reschedule).toContain(
      "v_order.reconcile_completion_kind = 'grant_recovery'",
    );
    expect(reschedule).toContain("p_official_status is not null");
    expect(reschedule).toContain(
      "reconcile_last_provider_status = case when orders.reconcile_completion_kind is null then p_official_status else orders.reconcile_last_provider_status end",
    );
    for (const audit of [
      "reconcile_query_provider_order_no",
      "reconcile_query_transaction_id",
      "reconcile_query_paid_amount_fen",
      "reconcile_query_paid_at",
    ]) {
      expect(reschedule).toContain(
        `${audit} = case when orders.reconcile_completion_kind is null then null else orders.${audit} end`,
      );
    }
    expect(reschedule).not.toContain("reconcile_completion_kind = null");
    expect(reschedule).toContain("reconcile_claim_token = null");
  });

  test("close rejects durable query checkpoints instead of deleting them", () => {
    const close = normalizeSql(extractFunction(
      migrationSql,
      "branding_close_unpaid_virtual_payment_reconciliation",
    ));

    expect(close).toContain("v_order.reconcile_completion_kind is not null");
    expect(close).toContain(
      "v_order.reconcile_query_provider_order_no is not null",
    );
    expect(close).not.toContain("reconcile_query_provider_order_no = null");
    expect(close).not.toContain("reconcile_completion_kind = null");
  });

  test("reschedules full official audit but closes only 0, 1, and 6", () => {
    const reschedule = normalizeSql(extractFunction(
      migrationSql,
      "branding_reschedule_virtual_payment_reconciliation",
    ));
    const close = normalizeSql(extractFunction(
      migrationSql,
      "branding_close_unpaid_virtual_payment_reconciliation",
    ));

    expect(reschedule).toContain(
      "p_official_status is not null and p_official_status not between 0 and 10",
    );
    expect(reschedule).toContain(
      "reconcile_last_provider_status = case when orders.reconcile_completion_kind is null then p_official_status else orders.reconcile_last_provider_status end",
    );
    expect(reschedule).not.toContain("p_official_status not in (");
    expect(close).toContain("p_official_status not in (0, 1, 6)");
  });

  test("uses fresh post-lock lease checks for every exact-token command", () => {
    for (const name of [
      "branding_reschedule_virtual_payment_reconciliation",
      "branding_close_unpaid_virtual_payment_reconciliation",
      "branding_prepare_successful_query_reconciliation",
      "branding_finalize_virtual_payment_reconciliation",
      "branding_begin_virtual_payment_delivery_retry",
      "branding_mark_virtual_payment_delivery",
    ]) {
      const command = normalizeSql(extractFunction(migrationSql, name));
      const lockAt = command.indexOf("for update");
      const clockAt = command.indexOf("v_now := clock_timestamp()", lockAt);
      const tokenAt = command.indexOf(
        "v_order.reconcile_claim_token is distinct from p_claim_token",
        clockAt,
      );
      expect(lockAt).toBeGreaterThan(0);
      expect(clockAt).toBeGreaterThan(lockAt);
      expect(tokenAt).toBeGreaterThan(clockAt);
      expect(command).toContain(
        "v_order.reconcile_claim_expires_at <= v_now",
      );
      expect(command).toContain("branding_virtual_reconciliation_claim_invalid");
    }
  });

  test("matches delivery terminal writes by attempt key and keeps table grants unchanged", () => {
    const normalized = normalizeSql(migrationSql);
    const delivery = normalizeSql(extractFunction(
      migrationSql,
      "branding_mark_virtual_payment_delivery",
    ));

    expect(delivery).toContain("p_delivery_status not in ('succeeded', 'failed')");
    expect(delivery).toContain(
      "v_order.provider_delivery_attempt_key is distinct from p_attempt_key",
    );
    expect(delivery).toContain(
      "provider_delivery_request_id = left(nullif(btrim(p_provider_request_id), ''), 128)",
    );
    expect(delivery).toContain("provider_delivery_provided_at = v_now");
    expect(delivery).not.toContain("branding_confirm_virtual_addon_purchase");

    for (const signature of [
      "branding_claim_virtual_payment_reconciliation_batch(integer, integer)",
      "branding_reschedule_virtual_payment_reconciliation(uuid, uuid, timestamptz, integer, text, text)",
      "branding_close_unpaid_virtual_payment_reconciliation(uuid, uuid, integer)",
      "branding_prepare_successful_query_reconciliation(uuid, uuid, integer, text, text, text, text, integer, text, integer, integer, text, text, timestamptz, text)",
      "branding_finalize_virtual_payment_reconciliation(uuid, uuid, integer, text, text, integer, timestamptz, uuid)",
      "branding_begin_virtual_payment_delivery_retry(uuid, uuid, uuid)",
      "branding_mark_virtual_payment_delivery(uuid, uuid, text, uuid, text, text, text)",
    ]) {
      expect(normalized).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated, service_role`,
      );
      expect(normalized).toContain(
        `grant execute on function public.${signature} to service_role`,
      );
    }
    expect(normalized).not.toMatch(/grant [^;]* on table /);
    expect(normalized).not.toMatch(
      /access[_ ]?token|session[_ ]?key|encrypted_secret|raw_(?:body|payload|response)/,
    );
  });
});
