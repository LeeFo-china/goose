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
    expect(functionSql).toContain("payment_expires_at > v_now");
    expect(functionSql.indexOf("from public.platform_addon_products"))
      .toBeLessThan(functionSql.indexOf("pg_advisory_xact_lock"));
    expect(functionSql.indexOf("pg_advisory_xact_lock"))
      .toBeLessThan(functionSql.indexOf("from public.tenant_virtual_addon_orders"));
    expect(functionSql.indexOf("from public.tenant_virtual_addon_orders"))
      .toBeLessThan(functionSql.indexOf("from public.platform_virtual_payment_products"));
    expect(functionSql).toContain("orders.idempotency_key = p_idempotency_key");
    expect(functionSql).toContain("return v_order");
    expect(sql).toContain("revoke all on function public.branding_create_virtual_addon_order");
    expect(sql).toContain("grant execute on function public.branding_create_virtual_addon_order");
  });

  test("blocks environment-scoped secret rotation only for open payment windows", () => {
    if (!existsSync(migrationPath)) return;
    const sql = normalize(readFileSync(migrationPath, "utf8"));
    expect(sql).toContain("before update of value_text, status or delete on public.system_settings");
    expect(sql).toContain("old.tenant_id is not null");
    expect(sql).toContain("old.key = 'wechat_virtual_payment_sandbox_secret_bundle'");
    expect(sql).toContain("old.key = 'wechat_virtual_payment_production_secret_bundle'");
    expect(sql).toContain("orders.environment = v_environment");
    expect(sql).toContain("orders.payment_status = 'pending'");
    expect(sql).toContain("orders.payment_expires_at > clock_timestamp()");
    expect(sql).toContain("message = 'branding_virtual_payment_secret_rotation_pending_orders'");
    expect(sql).toContain("set search_path = public, pg_temp");
  });
});
