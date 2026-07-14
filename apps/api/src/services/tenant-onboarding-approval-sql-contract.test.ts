import { describe, expect, test } from "bun:test";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
  EMPLOYEE_POST_CODE_VALUES,
  EmployeePostConfig,
} from "@gooes/domain";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714220000_create_tenant_onboarding_approval_rpc.sql",
  import.meta.url,
);

function sql() {
  return readFileSync(migration, "utf8");
}

function functionBody(source: string, name: string) {
  return source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
  ))?.[0] ?? "";
}

describe("tenant-onboarding atomic approval migration", () => {
  test("keeps both security-definer functions on a strict search path", () => {
    const source = sql();
    for (const name of [
      "initialize_default_decoration_tenant",
      "approve_tenant_onboarding_application",
    ]) {
      const body = functionBody(source, name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = pg_catalog, public, auth");
      expect(source).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(source).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}[^;]+ TO service_role;`,
        "s",
      ));
    }
    expect(source).toContain(
      "CREATE OR REPLACE FUNCTION public.approve_tenant_onboarding_application",
    );
  });

  test("reproduces the current tenant initialization idempotently", () => {
    const body = functionBody(sql(), "initialize_default_decoration_tenant");
    for (const relation of [
      "tenant_departments", "posts", "roles", "role_permissions",
      "employees", "employee_roles", "tenant_template_applications",
    ]) expect(body).toContain(`public.${relation}`);
    for (const conflictTarget of [
      "(tenant_id, code)", "(role_id, permission_id)",
      "(employee_id, role_id)",
      "(tenant_id, template_code, template_version)",
    ]) expect(body).toContain(`ON CONFLICT ${conflictTarget}`);
    expect(body).toContain("ON template.code = department_defaults.code");
    expect(body).toContain("COALESCE(existing.enabled, false)");
    expect(body).toContain("'SYSTEM_ADMIN'");
    expect(body).toContain("'system_admin'");
    expect(body).toContain("permission.status = 'active'");
    expect(body).toContain("'default_decoration_company'");
    expect(body).toContain("'2026.05.10'");
    expect(body).toContain("'departments_count', v_departments_count");
    expect(body).toContain("'admin_role_id', v_admin_role_id");
  });

  test("pins every current department alias instead of reading mutable template names", () => {
    const body = functionBody(sql(), "initialize_default_decoration_tenant");
    const departmentBlock = body.match(
      /WITH department_defaults\(code, alias_name\) AS \(\s*VALUES([\s\S]*?)\n  \),\n  upserted_departments/,
    )?.[1] ?? "";
    const mappings = [...departmentBlock.matchAll(/\('([A-Z0-9_]+)', '([^']+)'\)/g)]
      .map((match) => [match[1], match[2]]);
    expect(mappings).toEqual(DEPARTMENT_CODE_VALUES.map((code) => [
      code,
      DepartmentConfig[code].label,
    ]));
    expect(departmentBlock).not.toContain("template.default_name");
  });

  test("pins every current department and employee-post template code", () => {
    const body = functionBody(sql(), "initialize_default_decoration_tenant");
    const departmentBlock = body.match(
      /WITH department_defaults\(code, alias_name\) AS \(\s*VALUES([\s\S]*?)\n  \),\n  upserted_departments/,
    )?.[1] ?? "";
    const departmentCodes = [...departmentBlock.matchAll(/\('([A-Z0-9_]+)',/g)]
      .map((match) => match[1]);
    expect(departmentCodes).toEqual([...DEPARTMENT_CODE_VALUES]);

    const postBlock = body.match(
      /WITH post_defaults\(code, name, sort\) AS \(\s*VALUES([\s\S]*?)\n  \),\n  upserted_posts/,
    )?.[1] ?? "";
    const postCodes = [...postBlock.matchAll(/\('([A-Z0-9_]+)',/g)]
      .map((match) => match[1]);
    expect(postCodes).toEqual([...EMPLOYEE_POST_CODE_VALUES]);
    for (const code of EMPLOYEE_POST_CODE_VALUES) {
      expect(postBlock).toContain(`('${code}', '${EmployeePostConfig[code].label}',`);
    }
  });

  test("locks the exact application and handles idempotency before state and version", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toMatch(
      /WHERE application\.id = p_application_id\s+FOR UPDATE;/,
    );
    const idempotent = body.indexOf("v_application.status = 'approved'");
    const stateConflict = body.indexOf("'application_state_conflict'");
    const versionConflict = body.indexOf("'application_version_conflict'");
    expect(idempotent).toBeGreaterThan(0);
    expect(stateConflict).toBeGreaterThan(idempotent);
    expect(versionConflict).toBeGreaterThan(stateConflict);
    expect(body).toContain("'idempotent', true");
    expect(body).toContain("'subject_exists'");
    expect(body).toContain("'admin_phone_exists'");
  });

  test("revalidates bounded exact administrative ancestry and never picks a candidate", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toContain("WITH RECURSIVE region_ancestors");
    expect(body).toContain("ancestor.depth < 3");
    expect(body).toContain("child.level = 'district' AND parent.level = 'city'");
    expect(body).toContain("child.level = 'city' AND parent.level = 'province'");
    expect(body).toContain("LIMIT 101");
    expect(body).toContain("'partner_ambiguous'");
    expect(body).toContain("'partner_unavailable'");
    expect(body).toContain("partner.id = p_final_partner_id");
    expect(body).not.toMatch(/SELECT\s+partner\.id\s+INTO\s+v_final_partner_id/i);
  });

  test("validates slug and attribution then performs every conversion write atomically", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toContain("TENANT_ONBOARDING_TENANT_SLUG_INVALID");
    expect(body).toContain("TENANT_ONBOARDING_ATTRIBUTION_INVALID");
    expect(body).toContain("p_attribution_source_type IS NULL");
    expect(body).toContain("pg_catalog.pg_advisory_xact_lock");
    for (const mutation of [
      "INSERT INTO public.tenants",
      "public.initialize_default_decoration_tenant",
      "INSERT INTO public.tenant_service_areas",
      "INSERT INTO public.tenant_partner_bindings",
      "INSERT INTO public.tenant_service_provider_profiles",
      "UPDATE public.tenant_onboarding_applications",
      "INSERT INTO public.tenant_onboarding_application_reviews",
    ]) expect(body).toContain(mutation);
    expect(body).toMatch(/INSERT INTO public\.tenant_service_areas[\s\S]*?'inactive'/);
    expect(body).toContain("'status', 'approved'");
    expect(body).toContain("'idempotent', false");
  });

  test("revokes public callers and grants only service-role execution", () => {
    const source = sql();
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.approve_tenant_onboarding_application[\\s\\S]*? FROM ${role};`,
      ));
    }
    expect(source).toContain(
      "GRANT EXECUTE ON FUNCTION public.approve_tenant_onboarding_application",
    );
  });
});
