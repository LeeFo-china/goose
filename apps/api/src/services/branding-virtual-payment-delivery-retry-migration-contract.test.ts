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

describe("branding virtual payment delivery retry migration", () => {
  test("restarts only a failed delivery with a fresh attempt generation", () => {
    const normalized = normalizeSql(migrationSql);
    const claim = normalizeSql(extractFunction(
      migrationSql,
      "branding_claim_virtual_payment_reconciliation_batch",
    ));
    const beginRetry = normalizeSql(extractFunction(
      migrationSql,
      "branding_begin_virtual_payment_delivery_retry",
    ));
    const terminal = normalizeSql(extractFunction(
      migrationSql,
      "branding_mark_virtual_payment_delivery",
    ));

    expect(beginRetry).toContain(
      "v_order.payment_status <> 'succeeded' or v_order.fulfillment_status <> 'granted' or v_order.provider_delivery_status <> 'failed'",
    );
    expect(beginRetry).toContain(
      "v_order.provider_delivery_attempt_key is not distinct from p_attempt_key",
    );
    expect(beginRetry).toContain("branding_virtual_delivery_state_invalid");
    expect(beginRetry).toContain("provider_delivery_status = 'pending'");
    expect(beginRetry).toContain(
      "provider_delivery_attempt_count = orders.provider_delivery_attempt_count + 1",
    );
    expect(beginRetry).toContain(
      "provider_delivery_attempt_key = p_attempt_key",
    );
    for (const cleared of [
      "provider_delivery_request_id",
      "provider_delivery_provided_at",
      "provider_delivery_last_error_code",
      "provider_delivery_last_error",
      "reconcile_last_error_code",
      "reconcile_last_error",
    ]) {
      expect(beginRetry).toContain(`${cleared} = null`);
    }
    expect(beginRetry).toContain("reconcile_next_at = v_now");
    expect(beginRetry).toContain("reconcile_last_checked_at = v_now");
    expect(beginRetry).not.toContain("reconcile_claim_token = null");
    expect(beginRetry).not.toContain("reconcile_claim_expires_at = null");

    expect(normalized).toContain(
      "provider_delivery_status = 'pending' and provider_delivery_attempt_key is not null and provider_delivery_request_id is null",
    );
    expect(normalized).toContain(
      "new.provider_delivery_status in ('pending', 'failed')",
    );
    expect(claim).toContain(
      "orders.provider_delivery_status in ('pending', 'failed')",
    );
    expect(claim).not.toContain("provider_delivery_attempt_count =");
    expect(terminal).toContain("v_order.provider_delivery_status <> 'pending'");
    expect(terminal).toContain(
      "v_order.provider_delivery_attempt_key is distinct from p_attempt_key",
    );
    const failedTerminal = terminal.slice(terminal.indexOf("else update"));
    expect(failedTerminal).toContain("provider_delivery_status = 'failed'");
    expect(failedTerminal).toContain(
      "reconcile_next_at = v_now + interval '5 minutes'",
    );
    expect(failedTerminal).not.toContain("provider_delivery_attempt_count =");
    const succeededTerminal = terminal.slice(
      terminal.indexOf("if p_delivery_status = 'succeeded' then"),
      terminal.indexOf("else update"),
    );
    expect(succeededTerminal).toContain(
      "provider_delivery_status = 'succeeded'",
    );
    expect(succeededTerminal).toContain("reconcile_claim_token = null");
  });
});
