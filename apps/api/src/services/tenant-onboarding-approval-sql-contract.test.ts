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

  test("accepts only submitted or reviewing and treats null attribution as explicit unassigned", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    const reviewableGuard = body.match(
      /IF v_application\.status NOT IN \(([\s\S]*?)\) OR v_application\.converted_tenant_id/,
    )?.[1] ?? "";
    expect(reviewableGuard).toContain("'submitted'");
    expect(reviewableGuard).toContain("'reviewing'");
    expect(reviewableGuard).not.toContain("'supplement_required'");
    expect(body.match(/'partner_ambiguous'/g)).toHaveLength(1);
    expect(body.indexOf("'partner_ambiguous'"))
      .toBeGreaterThan(body.indexOf("p_attribution_source_type = 'region_auto_assignment'"));
  });

  test("resolves region paths with Task3 fail-closed transition semantics", () => {
    const helper = functionBody(sql(), "resolve_tenant_onboarding_region_paths");
    expect(helper).toMatch(
      /exact\.level = 'province' AND exact\.parent_adcode IS NULL[\s\S]*?THEN 'prefix'/,
    );
    expect(helper).toMatch(
      /parent\.adcode IS NULL[\s\S]*?THEN 'prefix'/,
    );
    expect(helper).toMatch(
      /parent\.adcode = ANY \(walk\.path_adcodes\)[\s\S]*?THEN 'exact_only'/,
    );
    expect(helper).toMatch(
      /NOT \([\s\S]*?walk\.current_level = 'district'[\s\S]*?parent\.level = 'city'[\s\S]*?walk\.current_level = 'city'[\s\S]*?parent\.level = 'province'[\s\S]*?\)[\s\S]*?THEN 'exact_only'/,
    );
    expect(helper).toMatch(
      /parent\.level = 'province'[\s\S]*?parent\.parent_adcode IS NOT NULL[\s\S]*?THEN 'exact_only'/,
    );
    expect(helper).toMatch(
      /walk\.depth \+ 1 >= 3[\s\S]*?THEN 'exact_only'/,
    );
    expect(helper).toContain("path_adcodes[1:1]");
    expect(helper).toContain("JOIN public.administrative_areas AS exact");
    expect(helper).toContain("exact.status = 'active'");
  });

  test("rejects missing exact service regions and uses only resolved path rows", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toContain("v_requested_region_count");
    expect(body).toContain("v_resolved_region_count");
    expect(body).toMatch(
      /IF v_requested_region_count <> v_resolved_region_count THEN[\s\S]*?'application_state_conflict'/,
    );
    expect(body).toMatch(
      /SELECT pg_catalog\.count\(\*\)::integer\s+INTO v_requested_region_count\s+FROM \(\s*SELECT DISTINCT requested\.code/,
    );
    expect(body.match(/public\.resolve_tenant_onboarding_region_paths/g)?.length)
      .toBeGreaterThanOrEqual(3);
    const serviceAreaWrite = body.match(
      /INSERT INTO public\.tenant_service_areas[\s\S]*?ORDER BY service_code/,
    )?.[0] ?? "";
    expect(serviceAreaWrite).toContain("FROM region_names");
    expect(serviceAreaWrite).not.toContain("v_application.address_city");
  });

  test("prevents partner phantoms for the low-frequency approval transaction", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toContain("Approval is a low-frequency background transaction");
    expect(body).toContain("LOCK TABLE public.administrative_areas IN SHARE MODE");
    expect(body).toContain("LOCK TABLE public.platform_partners IN SHARE MODE");
    expect(body.indexOf("LOCK TABLE public.administrative_areas IN SHARE MODE"))
      .toBeLessThan(body.indexOf("public.resolve_tenant_onboarding_region_paths"));
    expect(body.indexOf("LOCK TABLE public.platform_partners IN SHARE MODE"))
      .toBeLessThan(body.indexOf("bounded_partners AS"));
  });

  test("serializes every active employee phone mutation on the approval lock key", () => {
    const source = sql();
    const lockHelper = functionBody(source, "lock_tenant_onboarding_employee_phones");
    const trigger = functionBody(source, "lock_active_employee_phone_mutation");
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS employees_active_normalized_phone_idx\s+ON public\.employees \(\(pg_catalog\.btrim\(phone\)\)\)\s+WHERE status = 'active'\s+AND phone IS NOT NULL\s+AND pg_catalog\.btrim\(phone\) <> ''/,
    );
    expect(lockHelper).toContain("tenant-onboarding-admin-phone:");
    expect(lockHelper).toMatch(/SELECT DISTINCT[\s\S]*?ORDER BY normalized_phone ASC/);
    expect(trigger).toContain("OLD.status = 'active'");
    expect(trigger).toContain("NEW.status = 'active'");
    expect(trigger).toContain("public.lock_tenant_onboarding_employee_phones");
    expect(lockHelper).toContain("SECURITY DEFINER");
    expect(trigger).toContain("SECURITY DEFINER");
    expect(lockHelper).toContain("SET search_path = pg_catalog, public, auth");
    expect(trigger).toContain("SET search_path = pg_catalog, public, auth");
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.lock_tenant_onboarding_employee_phones[\\s\\S]*? FROM ${role};`,
      ));
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.lock_active_employee_phone_mutation[\\s\\S]*? FROM ${role};`,
      ));
    }
    expect(source).toMatch(
      /BEFORE INSERT OR UPDATE OF phone, status OR DELETE\s+ON public\.employees/,
    );
    expect(functionBody(source, "approve_tenant_onboarding_application"))
      .toContain("public.lock_tenant_onboarding_employee_phones");
  });

  test("fails approved idempotency closed when binding provenance is inconsistent", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    const idempotent = body.match(
      /-- Approved idempotency integrity start\.([\s\S]*?)-- Approved idempotency integrity end\./,
    )?.[1] ?? "";
    expect(idempotent).toContain("v_idempotent_binding_count");
    expect(idempotent).toContain("binding.partner_id = v_application.final_partner_id");
    expect(idempotent).toContain("binding.source_type = v_application.attribution_source_type");
    expect(idempotent).toContain("binding.source_id = v_application.id::text");
    expect(idempotent).toContain("binding.status = 'active'");
    expect(idempotent).toContain("binding.invite_code_id IS NOT DISTINCT FROM");
    expect(idempotent).toContain("v_application.final_partner_id IS NULL");
    expect(idempotent).toContain("'application_state_conflict'");
  });

  test("revalidates bounded exact administrative ancestry and never picks a candidate", () => {
    const body = functionBody(sql(), "approve_tenant_onboarding_application");
    expect(body).toContain("WITH region_paths AS");
    expect(body).toContain("public.resolve_tenant_onboarding_region_paths");
    expect(body).not.toContain("WITH RECURSIVE region_ancestors");
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
    const regionHelper = functionBody(
      source,
      "resolve_tenant_onboarding_region_paths",
    );
    expect(regionHelper).toContain("SECURITY DEFINER");
    expect(regionHelper).toContain("SET search_path = pg_catalog, public, auth");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.approve_tenant_onboarding_application[\\s\\S]*? FROM ${role};`,
      ));
      expect(source).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.resolve_tenant_onboarding_region_paths[\\s\\S]*? FROM ${role};`,
      ));
    }
    expect(source).toContain(
      "GRANT EXECUTE ON FUNCTION public.approve_tenant_onboarding_application",
    );
    expect(source).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_tenant_onboarding_region_paths[\s\S]*? TO service_role;/,
    );
  });
});
