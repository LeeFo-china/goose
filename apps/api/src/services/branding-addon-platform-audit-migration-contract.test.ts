import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260728120000_create_branding_addon_commerce.sql",
    import.meta.url,
  ),
  "utf8",
);

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function extractFunction(functionName: string): string {
  return migrationSql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
      "i",
    ),
  )?.[0] ?? "";
}

describe("branding add-on platform audit detail migration contract", () => {
  test("uses one private security-definer RPC with stable not-found null", () => {
    const functionName = "branding_get_platform_addon_order_audit";
    const command = normalizeSql(extractFunction(functionName));
    const normalizedMigration = normalizeSql(migrationSql);

    expect(command).not.toBe("");
    expect(command).toContain("returns jsonb");
    expect(command).toContain("security definer");
    expect(command).toContain("set search_path = public, pg_temp");
    expect(command).toContain("where addon_order.id = p_order_id");
    expect(command).toContain("return v_result");
    expect(command).not.toContain("raise exception");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(normalizedMigration).toContain(
        `revoke all on function public.${functionName}(uuid) from ${role}`,
      );
    }
    expect(normalizedMigration).toContain(
      `grant execute on function public.${functionName}(uuid) to service_role`,
    );
  });

  test("joins the current entitlement, purchase event, and latest audit once", () => {
    const command = normalizeSql(
      extractFunction("branding_get_platform_addon_order_audit"),
    );

    expect(command).toContain(
      "from public.tenant_addon_orders as addon_order",
    );
    expect(command).toContain(
      "left join public.tenant_entitlements as entitlement",
    );
    expect(command).toContain(
      "left join public.tenant_entitlement_events as entitlement_event",
    );
    expect(command).toContain("left join lateral");
    expect(command).toContain(
      "from public.platform_audit_logs as audit_log",
    );
    expect(command).toContain(
      "audit_log.action = 'branding_addon_purchase.confirm'",
    );
    expect(command).toContain(
      "order by audit_log.created_at desc, audit_log.id desc limit 1",
    );
  });

  test("builds explicit public summaries without internal payment data", () => {
    const command = normalizeSql(
      extractFunction("branding_get_platform_addon_order_audit"),
    );

    for (const publicField of [
      "'order'",
      "'entitlement'",
      "'entitlement_event'",
      "'audit'",
      "'order_no'",
      "'starts_at'",
      "'expires_at'",
      "'source'",
      "'event_type'",
      "'summary'",
    ]) {
      expect(command).toContain(publicField);
    }
    expect(command).not.toContain("to_jsonb(");
    for (const privateField of [
      "payer_openid",
      "payment_config_id",
      "expected_guard_version",
      "payment_mchid",
      "payment_appid",
      "prepay_id",
      "metadata",
      "raw_payload",
      "close_claim_token",
      "close_claim_expires_at",
      "close_last_error",
    ]) {
      expect(command).not.toContain(privateField);
    }
  });
});
