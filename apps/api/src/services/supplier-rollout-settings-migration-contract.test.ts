import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813150000_extend_tenant_supplier_rollout_command.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function rolloutFunction() {
  return sql.match(
    /CREATE FUNCTION public\.set_tenant_supplier_rollout_settings\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
}

describe("tenant supplier rollout command migration contract", () => {
  test("is transactional, bounded, and documents forward rollback", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/disable the rollout API[\s\S]*keep tenant data/i);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/COMMIT;\s*$/);
  });

  test("defines the complete atomic command signature", () => {
    const fn = compact(rolloutFunction());
    for (const parameter of [
      "p_tenant_id uuid",
      "p_module_enabled boolean",
      "p_require_active_contract_for_new_order boolean",
      "p_ownership_reads_enabled boolean",
      "p_private_supplier_writes_enabled boolean",
      "p_private_catalog_writes_enabled boolean",
      "p_procurement_snapshot_v1_enabled boolean",
      "p_expected_version integer",
      "p_actor_user_id uuid",
      "p_actor_employee_id uuid",
      "p_idempotency_key text",
      "p_reason text DEFAULT NULL",
    ]) {
      expect(fn).toContain(parameter);
    }
    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
  });

  test("locks the tenant and settings row before optimistic update", () => {
    const fn = rolloutFunction();
    expect(fn).toMatch(
      /FROM public\.tenants AS tenant[\s\S]*FOR UPDATE;[\s\S]*FROM public\.tenant_supplier_settings AS setting[\s\S]*FOR UPDATE;/,
    );
    expect(fn).toMatch(/v_setting\.version <> p_expected_version/);
    expect(fn).toContain("SUPPLIER_VERSION_CONFLICT");
  });

  test("enforces adjacent rollout transitions in both directions", () => {
    const fn = compact(rolloutFunction());
    expect(fn).toContain("v_target_level - v_current_level");
    expect(fn).toContain("abs(v_target_level - v_current_level) > 1");
    expect(fn).toContain("SUPPLIER_ROLLOUT_ORDER_INVALID");
    expect(fn).toMatch(
      /NOT p_module_enabled[\s\S]*p_ownership_reads_enabled[\s\S]*SUPPLIER_ROLLOUT_ORDER_INVALID/,
    );
    expect(fn).toMatch(
      /NOT p_module_enabled[\s\S]*p_reason IS NULL[\s\S]*SUPPLIER_STATE_CONFLICT/,
    );
  });

  test("uses a full request digest for idempotent replay and event audit", () => {
    const fn = rolloutFunction();
    for (const field of [
      "module_enabled",
      "require_active_contract_for_new_order",
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
      "expected_version",
      "reason",
      "actor_employee_id",
    ]) {
      expect(fn).toContain(`'${field}'`);
    }
    expect(fn).toContain("pg_advisory_xact_lock");
    expect(fn).toContain("set_tenant_supplier_rollout_settings");
    expect(fn).toContain("public.supplier_command_events");
  });

  test("exposes only the service-role execute grant", () => {
    const signature = "public.set_tenant_supplier_rollout_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, integer, uuid, uuid, text, text)";
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated, service_role;`,
    );
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role;`,
    );
  });
});
