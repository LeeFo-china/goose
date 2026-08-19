import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

const publicCommands = [
  "create_catalog_unit",
  "create_tenant_catalog_category",
  "update_tenant_catalog_category",
  "create_tenant_catalog_brand",
  "update_tenant_catalog_brand",
  "create_catalog_spec_definition",
  "update_catalog_spec_definition",
  "copy_platform_category_specs",
  "submit_tenant_catalog_unit_suggestion",
  "list_catalog_unit_suggestions",
  "review_catalog_unit_suggestion",
] as const;

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("tenant supplier catalog command security", () => {
  test("defines one private platform actor guard", () => {
    const guard = functionBody("assert_platform_catalog_actor");
    expect(guard).toContain("SECURITY DEFINER");
    expect(guard).toContain("SET search_path = pg_catalog, public");
    expect(guard).toContain("employee.user_id = p_actor_user_id");
    expect(guard).toContain("employee.id = p_actor_employee_id");
    expect(guard).toContain("employee.status = 'active'");
    expect(guard).toContain("employee.tenant_id IS NULL");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assert_platform_catalog_actor\([\s\S]*FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.assert_platform_catalog_actor/);
  });

  test("pins every command to a definer and fixed search path", () => {
    for (const command of publicCommands) {
      const body = functionBody(command);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = pg_catalog, public");
    }
  });

  test("checks tenant actor and all private catalog switches", () => {
    for (const command of [
      "create_tenant_catalog_category",
      "update_tenant_catalog_category",
      "create_tenant_catalog_brand",
      "update_tenant_catalog_brand",
      "copy_platform_category_specs",
      "submit_tenant_catalog_unit_suggestion",
    ]) {
      const body = functionBody(command);
      expect(body).toContain("public.assert_tenant_supplier_actor(");
      expect(body).toContain("module_enabled");
      expect(body).toContain("ownership_reads_enabled");
      expect(body).toContain("private_supplier_writes_enabled");
      expect(body).toContain("private_catalog_writes_enabled");
    }
  });

  test("separates platform and tenant spec command actors", () => {
    for (const command of [
      "create_catalog_spec_definition",
      "update_catalog_spec_definition",
    ]) {
      const body = functionBody(command);
      expect(body).toContain("IF p_tenant_id IS NULL THEN");
      expect(body).toContain("public.assert_platform_catalog_actor(");
      expect(body).toContain("public.assert_tenant_supplier_actor(");
      expect(body).toContain("module_enabled");
      expect(body).toContain("ownership_reads_enabled");
      expect(body).toContain("private_supplier_writes_enabled");
      expect(body).toContain("private_catalog_writes_enabled");
    }
  });

  test("separates platform review queues from tenant-owned reads", () => {
    const body = functionBody("list_catalog_unit_suggestions");
    expect(body).toContain("INTO v_actor_tenant_id");
    expect(body).toContain("employee.user_id = p_actor_user_id");
    expect(body).toContain("employee.status = 'active'");
    expect(body).toContain("IF v_actor_tenant_id IS NULL THEN");
    expect(body).toContain("public.assert_platform_catalog_actor(");
    expect(body).toContain("public.assert_tenant_supplier_actor(");
    expect(body).toContain("p_tenant_id IS DISTINCT FROM v_actor_tenant_id");
    expect(body).toContain("setting.module_enabled");
    expect(body).toContain("setting.ownership_reads_enabled");
    expect(body).not.toMatch(
      /setting\.ownership_reads_enabled[\s\S]{0,160}private_catalog_writes_enabled/,
    );
  });

  test("denies browser execution and grants only public commands to service_role", () => {
    for (const command of publicCommands) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${command}\\([\\s\\S]*?` +
            "FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${command}\\(`),
      );
    }
    expect(sql).toContain("FUNCTION_OWNER_INVALID");
    expect(sql).toContain("ARRAY['anon', 'authenticated', 'service_role']");
  });
});
