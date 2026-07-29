import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260728120000_create_branding_addon_commerce.sql",
  import.meta.url,
), "utf8");

function normalizeSql(sql: string) {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function extractFunction(sql: string, name: string) {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ));
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
}

function removeEntitlementLock(sql: string, name: string) {
  const source = extractFunction(sql, name);
  const mutated = source.replace(
    /PERFORM pg_advisory_xact_lock\(\s*hashtextextended\(\s*[\s\S]*?20260728\s*\)\s*\);/,
    "PERFORM 1;",
  );
  if (mutated === source) throw new Error(`Missing lock fixture in ${name}`);
  return sql.replace(source, mutated);
}

function assertAtomicEntitlementGuard(sql: string) {
  const normalized = normalizeSql(sql);
  const createOrder = normalizeSql(
    extractFunction(sql, "branding_create_addon_order"),
  );
  const manage = normalizeSql(
    extractFunction(sql, "apply_tenant_entitlement_action"),
  );
  const confirm = normalizeSql(
    extractFunction(sql, "branding_confirm_addon_purchase"),
  );
  const lockExpression = "pg_advisory_xact_lock(hashtextextended(";
  const createLockKey =
    "p_tenant_id::text || ':' || p_entitlement_code";
  const manageLockKey =
    "p_tenant_id::text || ':' || p_entitlement_code";
  const confirmLockKey =
    "v_order_tenant_id::text || ':' || v_order_entitlement_code";

  expect(createOrder).toContain("security definer");
  expect(createOrder).toContain("set search_path = public, pg_temp");
  expect(createOrder).toContain(lockExpression);
  expect(createOrder).toContain(createLockKey);
  expect(createOrder).toContain("entitlement.status = 'suspended'");
  expect(createOrder).toContain(
    "detail = 'branding_entitlement_suspended'",
  );
  expect(createOrder).toContain("entitlement.status = 'revoked'");
  expect(createOrder).toContain("detail = 'branding_entitlement_revoked'");
  expect(createOrder).toContain("insert into public.tenant_addon_orders");

  expect(manage).toContain("security definer");
  expect(manage).toContain("set search_path = public, pg_temp");
  expect(manage).toContain(lockExpression);
  expect(manage).toContain(manageLockKey);
  expect(manage.indexOf(lockExpression)).toBeLessThan(
    manage.indexOf("for update"),
  );
  expect(manage).toContain(
    "if p_action in ('suspend', 'revoke') then",
  );
  expect(manage).toContain("update public.tenant_addon_orders");
  expect(manage).toContain("status = 'closed'");
  expect(manage).toContain(
    "close_reason = case p_action when 'suspend' then 'entitlement_suspended' else 'entitlement_revoked' end",
  );
  expect(manage).toContain("where tenant_id = p_tenant_id");
  expect(manage).toContain("and status = 'pending'");

  const confirmLock = confirm.indexOf(lockExpression);
  const confirmOrderLock = confirm.indexOf(
    "from public.tenant_addon_orders as addon_order",
    confirmLock,
  );
  expect(confirmLock).toBeGreaterThan(-1);
  expect(confirm).toContain(confirmLockKey);
  expect(confirmOrderLock).toBeGreaterThan(confirmLock);
  expect(confirm).toContain(
    "v_order.status = 'closed' and v_order.close_reason in ('entitlement_suspended', 'entitlement_revoked')",
  );
  expect(confirm).toContain("closed_at = null");
  expect(confirm).toContain("close_reason = null");
  expect(confirm).toContain("'risk_close_reason', v_risk_close_reason");

  expect(normalized).not.toContain(
    "tr_branding_guard_entitlement_state_transition",
  );
  expect(normalized).toContain(
    "revoke all on function public.branding_create_addon_order(",
  );
  expect(normalized).toContain(
    ") from public; revoke all on function public.branding_create_addon_order(",
  );
  expect(normalized).toContain(
    ") from anon; revoke all on function public.branding_create_addon_order(",
  );
  expect(normalized).toContain(
    ") from authenticated; grant execute on function public.branding_create_addon_order(",
  );
  expect(normalized).toContain(") to service_role;");
  expect(normalized).toContain(
    "revoke all on function public.apply_tenant_entitlement_action(",
  );
}

describe("branding add-on entitlement guard migration", () => {
  test("serializes create, platform state changes, and late confirmation", () => {
    assertAtomicEntitlementGuard(migrationSql);
  });

  test("stores a bounded risk close reason without weakening normal order states", () => {
    const normalized = normalizeSql(migrationSql);
    expect(normalized).toContain("close_reason text null");
    expect(normalized).toContain(
      "close_reason is null or close_reason in ('entitlement_suspended', 'entitlement_revoked')",
    );
    expect(normalized).toMatch(
      /tenant_addon_orders_pending_state_check[\s\S]*?close_reason is null/,
    );
    expect(normalized).toMatch(
      /tenant_addon_orders_paid_state_check[\s\S]*?close_reason is null/,
    );
    expect(normalized).toMatch(
      /tenant_addon_orders_failed_state_check[\s\S]*?close_reason is null/,
    );
  });

  test("documents rollback for the replaced RPC, new RPC, and column", () => {
    const rollback = normalizeSql(
      migrationSql.slice(0, migrationSql.indexOf("BEGIN;")),
    );
    expect(rollback).toContain("branding_create_addon_order");
    expect(rollback).toContain("apply_tenant_entitlement_action");
    expect(rollback).toContain("20260727120000");
    expect(rollback).toContain("close_reason");
  });

  test.each([
    "apply_tenant_entitlement_action",
    "branding_create_addon_order",
    "branding_confirm_addon_purchase",
  ])("mutation contract rejects a missing shared lock in %s", (name) => {
    expect(() => assertAtomicEntitlementGuard(
      removeEntitlementLock(migrationSql, name),
    )).toThrow();
  });
});
