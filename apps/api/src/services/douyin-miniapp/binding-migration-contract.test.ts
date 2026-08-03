import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260719110000_add_douyin_installation_binding_rpc.sql",
  import.meta.url,
);

function migrationSql(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("douyin installation binding migration", () => {
  test("creates one secured service-role RPC with a fixed signature", () => {
    const sql = normalize(migrationSql());
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.bind_douyin_miniapp_installation( p_authorizer_appid text, p_tenant_id uuid, p_deployment_key text, p_runtime_config jsonb )");
    expect(sql).toContain("RETURNS public.douyin_miniapp_installations LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.bind_douyin_miniapp_installation( text, uuid, text, jsonb ) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.bind_douyin_miniapp_installation( text, uuid, text, jsonb ) TO service_role;");
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
  });

  test("locks installation then active tenant with an update-blocking lock", () => {
    const sql = normalize(migrationSql());
    const installationLock = sql.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const updateLock = sql.indexOf("FOR UPDATE", installationLock);
    const tenantLock = sql.indexOf("FROM public.tenants AS tenant", updateLock);
    const shareLock = sql.indexOf("FOR SHARE", tenantLock);
    expect(installationLock).toBeGreaterThan(-1);
    expect(updateLock).toBeGreaterThan(installationLock);
    expect(tenantLock).toBeGreaterThan(updateLock);
    expect(shareLock).toBeGreaterThan(tenantLock);
    expect(sql).toContain("tenant.status = 'active'");
    expect(sql).not.toContain("FOR KEY SHARE");
  });

  test("allows one first bind and only exact active idempotency", () => {
    const sql = normalize(migrationSql());
    expect(sql).toContain("jsonb_typeof(p_runtime_config) <> 'object'");
    expect(sql).toContain("v_installation.authorization_status = 'authorized_unbound'");
    expect(sql).toContain("tenant_id = p_tenant_id, deployment_key = p_deployment_key, runtime_config = p_runtime_config, authorization_status = 'active'");
    expect(sql).toContain("v_installation.authorization_status <> 'active'");
    expect(sql).toContain("v_installation.tenant_id IS DISTINCT FROM p_tenant_id");
    expect(sql).toContain("v_installation.deployment_key IS DISTINCT FROM p_deployment_key");
    expect(sql).toContain("v_installation.runtime_config IS DISTINCT FROM p_runtime_config");
    expect(sql).toContain("MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE'");
    expect(sql).toContain("MESSAGE = 'DOUYIN_INSTALLATION_BIND_CONFLICT'");
  });
});
