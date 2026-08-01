import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260801100000_harden_branding_virtual_order_payment_window.sql",
);

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function functionSql(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("$$;", start);
  return start >= 0 && end >= 0 ? sql.slice(start, end) : "";
}

describe("branding virtual order payment-window hardening migration", () => {
  test("exists as a forward migration with an explicit rollback note", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/^-- Rollback:/);
    expect(normalize(sql)).toMatch(/\bbegin;[\s\S]*commit;$/);
  });

  test("closes expired pending facts before reuse and preserves same-key truth", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const functionSql = sql.match(
      /create or replace function public\.branding_create_virtual_addon_order\([\s\S]*?\$\$;/,
    )?.[0] ?? "";
    expect(functionSql).toContain("set search_path = public, pg_temp");
    expect(functionSql).toContain("pg_advisory_xact_lock");
    expect(functionSql).toContain("payment_expires_at <= v_now");
    expect(functionSql).toContain("payment_status = 'closed'");
    expect(functionSql).toContain("payment_request_issued_at is null");
    expect(functionSql).toContain("payment_request_claim_expires_at <= v_now");
    expect(functionSql).toContain("orders.idempotency_key = p_idempotency_key");
    expect(functionSql).toContain("return v_order");
    expect(sql).toContain("revoke all on function public.branding_create_virtual_addon_order");
    expect(sql).toContain("grant execute on function public.branding_create_virtual_addon_order");
  });

  test("blocks environment-scoped secret rotation only for open payment windows", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    expect(sql).toContain("before insert or update or delete on public.system_settings");
    expect(sql).toContain("'wechat_virtual_payment_sandbox_secret_bundle'");
    expect(sql).toContain("'wechat_virtual_payment_production_secret_bundle'");
    expect(sql).toContain("orders.environment = v_environment");
    expect(sql).toContain("orders.payment_status = 'pending'");
    expect(sql).toContain("orders.payment_expires_at > v_now");
    expect(sql).toContain("message = 'branding_virtual_payment_secret_rotation_pending_orders'");
    expect(sql).toContain("set search_path = public, pg_temp");
  });

  test("stores a consistent short payment-request claim lifecycle", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    for (const column of [
      "payment_request_claim_token uuid null",
      "payment_request_claimed_at timestamptz null",
      "payment_request_claim_expires_at timestamptz null",
      "payment_request_issued_at timestamptz null",
      "payment_request_attempt_revision integer not null default 0",
    ]) expect(sql).toContain(column);
    expect(sql).toContain("tenant_virtual_addon_orders_payment_request_claim_check");
    expect(sql).toContain("tenant_virtual_addon_orders_payment_request_attempt_check");
  });

  test("claims finalizes and releases through service-role-only RPCs", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    for (const rpc of [
      "branding_claim_virtual_addon_payment_request",
      "branding_finalize_virtual_addon_payment_request",
      "branding_release_virtual_addon_payment_request_claim",
    ]) {
      expect(sql).toContain(`create or replace function public.${rpc}`);
      expect(sql).toContain(`revoke all on function public.${rpc}`);
      expect(sql).toContain(`grant execute on function public.${rpc}`);
    }
    expect(sql).toContain("payment_request_claim_expires_at = v_now + interval '30 seconds'");
    expect(sql).toContain("payment_request_issued_at = coalesce(payment_request_issued_at, v_now)");
    expect(sql).toContain("payment_request_attempt_revision = payment_request_attempt_revision + 1");
  });

  test("uses entitlement then global config locks before product mapping and order locks", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    for (const rpc of [
      "branding_claim_virtual_addon_payment_request",
      "branding_finalize_virtual_addon_payment_request",
    ]) {
      const body = functionSql(sql, rpc);
      const entitlementLock = body.indexOf(
        "hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)",
      );
      const configLock = body.indexOf(
        "hashtextextended('branding_virtual_payment_config', 20260801)",
      );
      const productLock = body.indexOf("from public.platform_addon_products");
      const mappingLock = body.indexOf("from public.platform_virtual_payment_products");
      const orderLock = body.indexOf("from public.tenant_virtual_addon_orders");
      expect(entitlementLock).toBeGreaterThanOrEqual(0);
      expect(entitlementLock).toBeLessThan(configLock);
      expect(configLock).toBeLessThan(productLock);
      expect(productLock).toBeLessThan(mappingLock);
      expect(mappingLock).toBeLessThan(orderLock);
    }
  });

  test("returns the same idempotent fact before current entitlement and config checks", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const body = functionSql(sql, "branding_create_virtual_addon_order");
    const entitlementLock = body.indexOf(
      "hashtextextended(p_tenant_id::text || ':custom_support_branding', 20260728)",
    );
    const replayLock = body.indexOf(
      "orders.idempotency_key = p_idempotency_key for update",
    );
    const replayReturn = body.indexOf("return v_order", replayLock);
    const configLock = body.indexOf(
      "hashtextextended('branding_virtual_payment_config', 20260801)",
    );
    const suspendedCheck = body.indexOf("entitlement.status = 'suspended'");
    const revokedCheck = body.indexOf("entitlement.status = 'revoked'");
    const productLock = body.indexOf("from public.platform_addon_products");
    expect(entitlementLock).toBeLessThan(replayLock);
    expect(replayLock).toBeLessThan(replayReturn);
    expect(replayReturn).toBeLessThan(configLock);
    expect(configLock).toBeLessThan(suspendedCheck);
    expect(replayReturn).toBeLessThan(revokedCheck);
    expect(suspendedCheck).toBeLessThan(productLock);
  });

  test("refreshes payment-window time only after advisory and row locks", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const create = functionSql(sql, "branding_create_virtual_addon_order");
    const pendingLock = create.indexOf(
      "and orders.product_code = v_product.code and orders.payment_status = 'pending' for update",
    );
    const createNow = create.indexOf("v_now := clock_timestamp()");
    expect(create).not.toContain("v_now timestamptz := clock_timestamp()");
    expect(pendingLock).toBeGreaterThanOrEqual(0);
    expect(pendingLock).toBeLessThan(createNow);
    expect(createNow).toBeLessThan(
      create.indexOf("v_order.payment_expires_at <= v_now", createNow),
    );

    for (const rpc of [
      "branding_claim_virtual_addon_payment_request",
      "branding_finalize_virtual_addon_payment_request",
    ]) {
      const body = functionSql(sql, rpc);
      const orderLock = body.indexOf(
        "where orders.tenant_id = p_tenant_id and orders.id = p_order_id for update",
      );
      const nowAssignment = body.indexOf("v_now := clock_timestamp()");
      expect(body).not.toContain("v_now timestamptz := clock_timestamp()");
      expect(orderLock).toBeGreaterThanOrEqual(0);
      expect(orderLock).toBeLessThan(nowAssignment);
      expect(nowAssignment).toBeLessThan(
        body.indexOf("payment_request_claim_expires_at", nowAssignment),
      );
      expect(nowAssignment).toBeLessThan(
        body.indexOf("payment_expires_at <= v_now", nowAssignment),
      );
    }
  });

  test("refreshes secret-rotation time after the global config lock", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const body = functionSql(sql, "guard_branding_virtual_payment_secret_rotation");
    const configLock = body.indexOf(
      "hashtextextended('branding_virtual_payment_config', 20260801)",
    );
    const nowAssignment = body.indexOf("v_now := clock_timestamp()");
    const pendingRead = body.indexOf("from public.tenant_virtual_addon_orders");
    expect(body).not.toContain("v_now timestamptz := clock_timestamp()");
    expect(configLock).toBeLessThan(nowAssignment);
    expect(nowAssignment).toBeLessThan(pendingRead);
  });

  test("keeps issued expired orders pending while closing only unissued stale facts", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const createStart = sql.indexOf(
      "create or replace function public.branding_create_virtual_addon_order",
    );
    const createEnd = sql.indexOf("$$;", createStart);
    const createRpc = sql.slice(createStart, createEnd);
    expect(createRpc).toContain("payment_request_issued_at is null");
    expect(createRpc).toContain("payment_request_claim_expires_at <= v_now");
    expect(createRpc).not.toContain("payment_request_issued_at is not null set payment_status = 'closed'");
    expect(createRpc).toContain("orders.payment_status = 'pending'");
  });

  test("frees a locally closable stale pending fact before checking its old owner", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const body = functionSql(sql, "branding_create_virtual_addon_order");
    const pendingLock = body.indexOf(
      "and orders.product_code = v_product.code and orders.payment_status = 'pending' for update",
    );
    const closableCheck = body.indexOf(
      "if v_order.payment_request_issued_at is null",
      pendingLock,
    );
    const payerCheck = body.indexOf(
      "if v_order.payer_openid is distinct from p_payer_openid",
      pendingLock,
    );
    const actorCheck = body.indexOf(
      "if v_order.created_by is distinct from p_created_by",
      pendingLock,
    );
    expect(pendingLock).toBeGreaterThanOrEqual(0);
    expect(closableCheck).toBeLessThan(payerCheck);
    expect(closableCheck).toBeLessThan(actorCheck);
  });

  test("guards secret identity and atomically disables the matching mapping", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    expect(sql).toContain("before insert or update or delete on public.system_settings");
    expect(sql).toContain("branding_virtual_payment_secret_identity_immutable");
    expect(sql).toContain("branding_virtual_payment_secret_scope_invalid");
    expect(sql).toContain("hashtextextended('branding_virtual_payment_config', 20260801)");
    expect(sql).toContain("orders.payment_request_claim_expires_at > v_now");
    expect(sql).toContain("orders.payment_request_issued_at is not null");
    expect(sql).toContain("update public.platform_virtual_payment_products");
    expect(sql).toContain("status = 'disabled'");
    expect(sql).toContain("validation_status = 'pending'");
    expect(sql).toContain("validated_at = null");
  });

  test("does not disable or version-bump a mapping for a no-op secret update", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    const body = functionSql(sql, "guard_branding_virtual_payment_secret_rotation");
    expect(body).toMatch(
      /if v_effective_changed then if exists \([\s\S]*?update public\.platform_virtual_payment_products[\s\S]*?version = version \+ 1[\s\S]*?end if;/,
    );
    expect(body).not.toContain("if v_effective_changed and exists");
  });

  test("closes only unissued unclaimed orders when entitlement is suspended or revoked", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    expect(sql).toContain("create trigger tr_tenant_entitlements_close_unissued_virtual_orders");
    expect(sql).toContain("after update of status on public.tenant_entitlements");
    expect(sql).toContain("new.status in ('suspended', 'revoked')");
    expect(sql).toContain("payment_request_issued_at is null");
    expect(sql).toContain("payment_request_claim_token is null");
    expect(sql).toContain("branding_entitlement_suspended");
    expect(sql).toContain("branding_entitlement_revoked");
  });
});
