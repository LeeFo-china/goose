import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260720100000_harden_douyin_platform_installation_management.sql",
  import.meta.url,
);

function source(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function normalize(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("douyin platform installation management migration", () => {
  test("creates secured fixed-search-path template and enable RPCs", () => {
    const sql = normalize(source());
    expect(existsSync(migration)).toBe(true);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.create_douyin_template_development_installation( p_component_appid text, p_authorizer_appid text, p_tenant_id uuid, p_runtime_config jsonb )",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.enable_douyin_miniapp_installation( p_installation_id uuid )",
    );
    expect(sql.match(/RETURNS public\.douyin_miniapp_installations LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public/g))
      .toHaveLength(3);
  });

  test("serializes template creation around active component, active tenant and unique AppID", () => {
    const raw = source();
    const sql = normalize(raw);
    const start = sql.indexOf("FUNCTION public.create_douyin_template_development_installation");
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.enable_douyin_miniapp_installation", start);
    const block = sql.slice(start, end);
    const installationLock = block.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const visibleComponentLock = block.indexOf(
      "FROM public.douyin_third_party_components AS component",
      installationLock,
    );
    const visibleTenantLock = block.indexOf("FROM public.tenants AS tenant", visibleComponentLock);
    const noVisibleComponentLock = block.indexOf(
      "FROM public.douyin_third_party_components AS component",
      visibleComponentLock + 1,
    );
    const noVisibleTenantLock = block.indexOf("FROM public.tenants AS tenant", noVisibleComponentLock);
    const insert = block.indexOf("INSERT INTO public.douyin_miniapp_installations", noVisibleTenantLock);
    const conflictRead = block.indexOf(
      "FROM public.douyin_miniapp_installations AS installation",
      insert,
    );
    expect(installationLock).toBeGreaterThan(-1);
    expect(visibleComponentLock).toBeGreaterThan(installationLock);
    expect(visibleTenantLock).toBeGreaterThan(visibleComponentLock);
    expect(noVisibleComponentLock).toBeGreaterThan(visibleTenantLock);
    expect(noVisibleTenantLock).toBeGreaterThan(noVisibleComponentLock);
    expect(insert).toBeGreaterThan(noVisibleTenantLock);
    expect(conflictRead).toBeGreaterThan(insert);
    expect(block).toContain("component.status = 'active'");
    expect(block).toContain("tenant.status = 'active'");
    expect(block).toContain("FOR SHARE");
    expect(block).toContain("ON CONFLICT (authorizer_appid) DO NOTHING");
    expect(block).toContain("v_installation.component_appid IS DISTINCT FROM p_component_appid");
    expect(block).toContain("v_installation.tenant_id IS DISTINCT FROM p_tenant_id");
    expect(block).toContain("v_installation.installation_kind <> 'template_development'");
    expect(block.match(/v_installation\.authorization_status <> 'active'/g))
      .toHaveLength(2);
    expect(block).toContain("MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE'");
    expect(block).toContain("MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE'");
    expect(block).toContain("MESSAGE = 'DOUYIN_TEMPLATE_INSTALLATION_CONFLICT'");
    expect(block).not.toMatch(/p_(?:deployment|access_token|refresh_token|secret|credential)/);
    expect(raw.replace(/\s+/g, " ")).toContain(
      "ON CONFLICT can only wait for another creator's uncommitted unique row",
    );
    expect(raw.replace(/\s+/g, " ")).toContain("SHARE locks are compatible");
  });

  test("enable locks installation then active component then active tenant before update", () => {
    const sql = normalize(source());
    const start = sql.indexOf("FUNCTION public.enable_douyin_miniapp_installation");
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.bind_douyin_miniapp_installation", start);
    const block = sql.slice(start, end);
    const installationLock = block.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const componentLock = block.indexOf("FROM public.douyin_third_party_components AS component", installationLock);
    const tenantLock = block.indexOf("FROM public.tenants AS tenant", componentLock);
    const update = block.indexOf("authorization_status = 'active'", tenantLock);
    expect(installationLock).toBeGreaterThan(-1);
    expect(block.indexOf("FOR UPDATE", installationLock)).toBeGreaterThan(installationLock);
    expect(componentLock).toBeGreaterThan(installationLock);
    expect(tenantLock).toBeGreaterThan(componentLock);
    expect(update).toBeGreaterThan(tenantLock);
    expect(block).toContain("v_installation.authorization_status <> 'disabled'");
    expect(block).toContain("component.status = 'active'");
    expect(block).toContain("tenant.status = 'active'");
    expect(block).toContain("MESSAGE = 'DOUYIN_INSTALLATION_STATE_CONFLICT'");
    expect(block).toContain("MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE'");
    expect(block).toContain("MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE'");
  });

  test("replaces bind with installation-component-tenant lock ordering", () => {
    const sql = normalize(source());
    const start = sql.indexOf("FUNCTION public.bind_douyin_miniapp_installation");
    const block = sql.slice(start);
    const installationLock = block.indexOf("FROM public.douyin_miniapp_installations AS installation");
    const componentLock = block.indexOf("FROM public.douyin_third_party_components AS component", installationLock);
    const tenantLock = block.indexOf("FROM public.tenants AS tenant", componentLock);
    expect(installationLock).toBeGreaterThan(-1);
    expect(componentLock).toBeGreaterThan(installationLock);
    expect(tenantLock).toBeGreaterThan(componentLock);
    expect(block).toContain("component.status = 'active'");
    expect(block).toContain("tenant.status = 'active'");
    expect(block).toContain("MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE'");
    expect(block).toContain("MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE'");
    expect(block).toContain("MESSAGE = 'DOUYIN_INSTALLATION_BIND_CONFLICT'");
  });

  test("keeps every RPC service-role-only and documents rollback", () => {
    const raw = source();
    const sql = normalize(raw);
    const signatures = [
      ["public.create_douyin_template_development_installation( text, text, uuid, jsonb )",
        "public.create_douyin_template_development_installation( text, text, uuid, jsonb )"],
      ["public.enable_douyin_miniapp_installation(uuid)",
        "public.enable_douyin_miniapp_installation( uuid )"],
      ["public.bind_douyin_miniapp_installation( text, uuid, text, jsonb )",
        "public.bind_douyin_miniapp_installation( text, uuid, text, jsonb )"],
    ];
    for (const [aclSignature, rollbackSignature] of signatures) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${aclSignature} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${aclSignature} FROM service_role;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${aclSignature} TO service_role;`);
      expect(raw).toContain(`DROP FUNCTION IF EXISTS ${rollbackSignature};`);
    }
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/);
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
});
