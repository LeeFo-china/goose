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
  test("adds bounded scheduling and provider-delivery audit state", () => {
    const normalized = normalizeSql(migrationSql);

    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalized).toMatch(/\bbegin;[\s\S]*commit;$/);
    for (const column of [
      "reconcile_next_at timestamptz",
      "reconcile_last_checked_at timestamptz",
      "reconcile_last_provider_status integer",
      "reconcile_last_error_code text",
      "provider_delivery_status text not null default 'not_required'",
      "provider_delivery_attempt_count integer not null default 0",
      "provider_delivery_last_error_code text",
      "provider_delivery_last_error text",
      "provider_delivery_notified_at timestamptz",
      "provider_delivery_request_id text",
    ]) {
      expect(normalized).toContain(column);
    }
    expect(normalized).toContain(
      "provider_delivery_status in ('not_required', 'pending', 'succeeded', 'failed')",
    );
    expect(normalized).toContain("provider_delivery_attempt_count >= 0");
    for (const bounded of [
      "reconcile_last_error_code",
      "provider_delivery_last_error_code",
      "provider_delivery_last_error",
      "provider_delivery_request_id",
    ]) {
      expect(normalized).toContain(`char_length(${bounded}) <=`);
    }
  });

  test("claims only bounded due work with skip-locked leases", () => {
    const command = normalizeSql(extractFunction(
      migrationSql,
      "branding_claim_virtual_payment_reconciliation_batch",
    ));

    expect(command).toContain("security definer");
    expect(command).toContain("set search_path = pg_catalog, public");
    expect(command).toContain(
      "least(greatest(coalesce(p_limit, 20), 1), 100)",
    );
    expect(command).toContain(
      "least(greatest(coalesce(p_lease_seconds, 120), 30), 600)",
    );
    expect(command).toContain("for update skip locked");
    expect(command).toContain(
      "order by orders.reconcile_next_at asc, orders.payment_expires_at asc, orders.id asc",
    );
    expect(command).toContain(
      "orders.payment_status = 'pending' and orders.payment_expires_at <= v_now and orders.payment_request_issued_at is not null",
    );
    expect(command).toContain(
      "orders.payment_status = 'succeeded' and orders.fulfillment_status = 'grant_failed'",
    );
    expect(command).toContain(
      "orders.payment_status = 'succeeded' and orders.fulfillment_status = 'granted' and orders.provider_delivery_status in ('pending', 'failed')",
    );
    expect(command).not.toMatch(
      /payment_status = 'pending'[\s\S]{0,180}payment_request_issued_at is null/,
    );
    expect(command).toContain(
      "reconcile_attempt_count = orders.reconcile_attempt_count + 1",
    );
    expect(command).not.toContain("returning orders.*");
    const returnedColumns = command.slice(command.lastIndexOf("returning"));
    for (const fact of [
      "orders.provider_order_no",
      "orders.transaction_id",
      "orders.paid_amount_fen",
      "orders.paid_at",
      "orders.entitlement_event_id",
      "orders.reconcile_claim_token",
      "orders.reconcile_claim_expires_at",
    ]) {
      expect(returnedColumns).toContain(fact);
    }
  });

  test("uses unexpired exact-token row locks for every command", () => {
    for (const name of [
      "branding_reschedule_virtual_payment_reconciliation",
      "branding_close_unpaid_virtual_payment_reconciliation",
      "branding_complete_virtual_payment_reconciliation",
      "branding_mark_virtual_payment_delivery",
    ]) {
      const command = normalizeSql(extractFunction(migrationSql, name));
      expect(command).toContain("security definer");
      expect(command).toContain("for update");
      expect(command).toContain("orders.id = p_order_id");
      expect(command).toContain("orders.reconcile_claim_token = p_claim_token");
      expect(command).toContain("orders.reconcile_claim_expires_at > v_now");
      expect(command).toContain("errcode = 'p0001'");
      expect(command).toContain("branding_virtual_reconciliation_claim_invalid");
    }

    const reschedule = normalizeSql(extractFunction(
      migrationSql,
      "branding_reschedule_virtual_payment_reconciliation",
    ));
    expect(reschedule).toContain("left(nullif(btrim(p_error_code), ''), 100)");
    expect(reschedule).toContain(
      "left(nullif(btrim(p_error_summary), ''), 500)",
    );
    expect(reschedule).toContain(
      "v_order.payment_status = 'succeeded' and v_order.fulfillment_status = 'grant_failed'",
    );
    expect(reschedule).toContain("branding_virtual_reconciliation_state_invalid");

    const close = normalizeSql(extractFunction(
      migrationSql,
      "branding_close_unpaid_virtual_payment_reconciliation",
    ));
    expect(close).toContain("p_official_status not in (0, 1, 6)");
    expect(close).toContain("payment_request_issued_at is null");
    expect(close).toContain("reconcile_last_checked_at = v_now");
    expect(close).toContain("reconcile_last_provider_status = p_official_status");
  });

  test("keeps delivery retry private and service-role-only", () => {
    const normalized = normalizeSql(migrationSql);
    const delivery = normalizeSql(extractFunction(
      migrationSql,
      "branding_mark_virtual_payment_delivery",
    ));

    expect(delivery).toContain(
      "p_delivery_status not in ('pending', 'succeeded', 'failed')",
    );
    expect(delivery).toContain(
      "provider_delivery_attempt_count = orders.provider_delivery_attempt_count + 1",
    );
    expect(delivery).toContain("provider_delivery_notified_at = v_now");
    expect(delivery).toContain("reconcile_claim_token = null");
    expect(delivery).toContain("reconcile_claim_expires_at = null");
    expect(delivery).not.toContain("branding_confirm_virtual_addon_purchase");
    expect(delivery).not.toContain("tenant_entitlements");
    expect(delivery).not.toContain("tenant_entitlement_events");

    const complete = normalizeSql(extractFunction(
      migrationSql,
      "branding_complete_virtual_payment_reconciliation",
    ));
    expect(
      complete.match(/branding_confirm_virtual_addon_purchase/g) ?? [],
    ).toHaveLength(1);

    for (const signature of [
      "branding_claim_virtual_payment_reconciliation_batch(integer, integer)",
      "branding_reschedule_virtual_payment_reconciliation(uuid, uuid, timestamptz, text, text)",
      "branding_close_unpaid_virtual_payment_reconciliation(uuid, uuid, integer)",
      "branding_complete_virtual_payment_reconciliation(uuid, uuid, text, text, text, text, integer, text, integer, integer, text, text, timestamptz, text, text)",
      "branding_mark_virtual_payment_delivery(uuid, uuid, text, text, text, text)",
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
