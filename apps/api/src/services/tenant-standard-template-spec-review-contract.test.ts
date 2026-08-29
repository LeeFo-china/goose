import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql",
  import.meta.url,
);
const legacyApprovalMigration = new URL(
  "../../../../supabase/migrations/20260714220000_create_tenant_onboarding_approval_rpc.sql",
  import.meta.url,
);
const platformOperatorMigration = new URL(
  "../../../../supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql",
  import.meta.url,
);

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function sql(url: URL): string {
  return readFileSync(url, "utf8");
}

function extractFunction(source: string, name: string): string {
  return source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ))?.[0] ?? "";
}

function functionParameters(source: string, name: string): string {
  const body = extractFunction(source, name);
  return normalizeSql(body.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\)\\s*RETURNS`,
    "i",
  ))?.[1] ?? "");
}

describe("standard tenant template spec-review contracts", () => {
  test("uses one deterministic runtime permission source for validation and grants", () => {
    const initializer = normalizeSql(extractFunction(
      sql(migration),
      "initialize_default_decoration_tenant",
    ));
    const sourceStart = initializer.search(
      /with non_admin_permission_defaults\s*\(\s*role_code, permission_code, access_scope\s*\) as \( values/,
    );
    const guardStart = initializer.indexOf(
      "if v_expected_non_admin_permission_count <>",
      sourceStart,
    );
    const pipeline = initializer.slice(sourceStart, guardStart);

    expect(sourceStart).toBeGreaterThan(0);
    expect(guardStart).toBeGreaterThan(sourceStart);
    expect(pipeline.match(/with non_admin_permission_defaults\s*\(/g)).toHaveLength(1);
    expect(pipeline).toContain("resolved_non_admin_permissions as (");
    expect(pipeline).toContain("inserted_non_admin_permissions as ( insert into public.role_permissions");
    expect(pipeline).toContain("from resolved_non_admin_permissions as resolved");
    expect(pipeline).toContain("where counts.expected_count = counts.resolved_count");
    expect(pipeline).not.toContain("tenant_templates");
    expect(pipeline).not.toContain("jsonb_to_recordset");
    expect(initializer).not.toContain("template.payload -> 'role_permissions'");
  });

  test("replaces approval retries with current-version preference and legacy fallback", () => {
    const legacy = sql(legacyApprovalMigration);
    const source = sql(migration);
    const legacyBody = normalizeSql(extractFunction(
      legacy,
      "approve_tenant_onboarding_application",
    ));
    const replacementBody = normalizeSql(extractFunction(
      source,
      "approve_tenant_onboarding_application",
    ));
    const retryBranch = replacementBody.match(
      /if v_application\.status = 'approved' then([\s\S]*?)if v_application\.status not in/,
    )?.[1] ?? "";
    const historicalPhoneLock =
      "perform public.lock_tenant_onboarding_employee_phones( " +
      "array[v_application.admin_phone]::text[] );";
    const sharedPhonePrecheck =
      "if public.lock_and_check_active_employee_phone(v_application.admin_phone) " +
      "then return pg_catalog.jsonb_build_object('status', 'admin_phone_exists'); " +
      "end if;";
    const historicalActivePhonePrecheck =
      "perform employee.id from public.employees as employee " +
      "where employee.status = 'active' and employee.phone is not null " +
      "and pg_catalog.btrim(employee.phone) <> '' " +
      "and pg_catalog.btrim(employee.phone) = " +
      "pg_catalog.btrim(v_application.admin_phone) limit 1; " +
      "if found then return pg_catalog.jsonb_build_object(" +
      "'status', 'admin_phone_exists'); end if;";
    const expectedReplacementBody = normalizeSql(
      legacyBody.replace(
        "and template_application.template_version = '2026.05.10' limit 1;",
        "and template_application.template_version in ('2026.08.30', '2026.05.10') " +
          "order by case template_application.template_version " +
          "when '2026.08.30' then 0 else 1 end limit 1;",
      ).replace(historicalPhoneLock, sharedPhonePrecheck)
        .replace(historicalActivePhonePrecheck, ""),
    );

    expect(legacyBody).toContain("template_application.template_version = '2026.05.10'");
    expect(legacyBody).toContain(historicalPhoneLock);
    expect(legacyBody).toContain(historicalActivePhonePrecheck);
    expect(sql(migration)).toMatch(
      /^CREATE OR REPLACE FUNCTION public\.approve_tenant_onboarding_application\(/m,
    );
    expect(replacementBody).not.toBe("");
    expect(replacementBody).toBe(expectedReplacementBody);
    expect(functionParameters(source, "approve_tenant_onboarding_application"))
      .toBe(functionParameters(legacy, "approve_tenant_onboarding_application"));
    expect(retryBranch).toContain(
      "template_application.template_version in ('2026.08.30', '2026.05.10')",
    );
    expect(retryBranch).toContain(
      "order by case template_application.template_version when '2026.08.30' then 0 else 1 end",
    );
    expect(replacementBody).toMatch(
      /v_initialization := public\.initialize_default_decoration_tenant\( v_tenant_id, v_application\.admin_name, v_application\.admin_phone, p_reviewer_employee_id \);/,
    );
  });

  test("covers and validates the complete platform tenant create input", () => {
    const command = normalizeSql(extractFunction(
      sql(migration),
      "create_tenant_with_default_template",
    ));
    const parameters = functionParameters(
      sql(migration),
      "create_tenant_with_default_template",
    );
    const insert = command.match(
      /insert into public\.tenants \(([\s\S]*?)\) values \(([\s\S]*?)\) returning tenants\.\* into v_tenant;/,
    );
    const columns = insert?.[1]?.split(",").map((value) => value.trim()) ?? [];
    const values = insert?.[2]?.split(",").map((value) => value.trim()) ?? [];

    expect(parameters).toContain("p_admin_department_code text default 'exec_office'");
    expect(parameters).toContain("p_admin_post_code text default 'system_admin'");
    expect(command).toContain(
      "p_admin_department_code is distinct from 'exec_office'",
    );
    expect(command).toContain("p_admin_post_code is distinct from 'system_admin'");
    expect(command).toContain(
      "v_slug text := pg_catalog.btrim(coalesce(p_slug, ''))",
    );
    expect(command).not.toContain("p_slug is distinct from v_slug");
    expect(command).toContain("v_slug !~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'");
    expect(command).toContain("v_address_source text := p_address_source");
    for (const validation of [
      "pg_catalog.char_length(v_address) > 200",
      "pg_catalog.char_length(v_address_title) > 120",
      "pg_catalog.char_length(v_address_poi_id) > 120",
      "pg_catalog.char_length(v_address_province) > 40",
      "pg_catalog.char_length(v_address_city) > 40",
      "pg_catalog.char_length(v_address_district) > 40",
      "pg_catalog.char_length(v_address_adcode) > 20",
      "pg_catalog.char_length(v_contact_name) > 80",
      "pg_catalog.char_length(v_contact_phone) > 30",
      "p_address_latitude not between -90 and 90",
      "p_address_longitude not between -180 and 180",
      "p_address_confidence not between 0 and 1",
    ]) expect(command).toContain(validation);
    expect(command).toMatch(
      /v_address_source not in \( 'manual', 'tencent_suggestion', 'tencent_geocoder', 'map_picker' \)/,
    );
    expect(columns).toEqual([
      "name", "slug", "status", "address", "address_title", "address_poi_id",
      "address_province", "address_city", "address_district", "address_adcode",
      "address_latitude", "address_longitude", "address_source",
      "address_confidence", "address_confirmed_at", "contact_name", "contact_phone",
    ]);
    expect(values).toEqual([
      "v_name", "v_slug", "p_status", "v_address", "v_address_title",
      "v_address_poi_id", "v_address_province", "v_address_city",
      "v_address_district", "v_address_adcode", "p_address_latitude",
      "p_address_longitude", "v_address_source", "p_address_confidence",
      "p_address_confirmed_at", "v_contact_name", "v_contact_phone",
    ]);
  });

  test("locks and rejects tenants outside initializable statuses", () => {
    const initializer = normalizeSql(extractFunction(
      sql(migration),
      "initialize_default_decoration_tenant",
    ));

    expect(initializer).toMatch(
      /select tenant\.status into v_tenant_status from public\.tenants as tenant where tenant\.id = p_tenant_id for update;/,
    );
    expect(initializer).toMatch(
      /if v_tenant_status not in \('active', 'suspended'\) then raise exception using [^;]*message = 'tenant_initialization_tenant_state_invalid'; end if;/,
    );
  });

  test("rejects mixed template versions before current-version idempotency", () => {
    const initializer = normalizeSql(extractFunction(
      sql(migration),
      "initialize_default_decoration_tenant",
    ));
    const allVersionsLock = initializer.indexOf(
      "perform application.id from public.tenant_template_applications as application " +
        "where application.tenant_id = p_tenant_id " +
        "and application.template_code = 'default_decoration_company' for update;",
    );
    const mixedVersionCheck = initializer.indexOf(
      "and application.template_version is distinct from '2026.08.30'",
      allVersionsLock,
    );
    const currentVersionLookup = initializer.indexOf(
      "select application.* into v_existing_application",
      allVersionsLock,
    );
    const mixedVersionGuard = initializer.slice(
      mixedVersionCheck,
      currentVersionLookup,
    );

    expect(allVersionsLock).toBeGreaterThan(0);
    expect(mixedVersionCheck).toBeGreaterThan(allVersionsLock);
    expect(currentVersionLookup).toBeGreaterThan(mixedVersionCheck);
    expect(mixedVersionGuard).toMatch(
      /application\.template_version is distinct from '2026\.08\.30' limit 1; if found then raise exception using [^;]*message = 'tenant_template_state_conflict'; end if;/,
    );
    expect(initializer.indexOf(
      "return v_existing_application.result;",
      currentVersionLookup,
    )).toBeGreaterThan(currentVersionLookup);
  });

  test("fails closed when initialization identity fields are null", () => {
    const command = normalizeSql(extractFunction(
      sql(migration),
      "create_tenant_with_default_template",
    ));
    const guard = command.match(
      /if v_initialization ->> 'template_code'[\s\S]*?message = 'tenant_template_state_conflict'; end if;/,
    )?.[0] ?? "";

    expect(guard).toContain(
      "v_initialization ->> 'template_code' is distinct from 'default_decoration_company'",
    );
    expect(guard).toContain(
      "v_initialization ->> 'template_version' is distinct from '2026.08.30'",
    );
    expect(guard).not.toContain("<>");
  });

  test("records a distinct ISO release timestamp in audit metadata", () => {
    const source = normalizeSql(sql(migration));
    const releasedAt = source.match(/'released_at', '([^']+)'/)?.[1] ?? "";

    expect(releasedAt).not.toBe("");
    expect(releasedAt).not.toBe("2026.08.30");
    expect(Number.isNaN(Date.parse(releasedAt))).toBe(false);
  });

  test("centralizes both employee-phone advisory locks in one global order", () => {
    const source = sql(migration);
    const normalized = normalizeSql(source);
    const helper = normalizeSql(extractFunction(
      source,
      "lock_tenant_onboarding_employee_phones",
    ));
    const platformGuard = normalizeSql(extractFunction(
      source,
      "guard_platform_employee_phone",
    ));
    const activePhoneTrigger = normalizeSql(extractFunction(
      source,
      "lock_active_employee_phone_mutation",
    ));
    const employeeLock = helper.indexOf("'employee-phone:' || v_phone");
    const onboardingLock = helper.indexOf(
      "'tenant-onboarding-admin-phone:' || v_phone",
    );

    expect(helper).not.toBe("");
    expect(helper).toContain("security definer");
    expect(helper).toContain("set search_path = pg_catalog, public, auth");
    expect(helper).toMatch(/select distinct[\s\S]*order by normalized_phone asc/);
    expect(employeeLock).toBeGreaterThan(0);
    expect(onboardingLock).toBeGreaterThan(employeeLock);
    expect(helper.match(/pg_catalog\.pg_advisory_xact_lock/g)).toHaveLength(2);

    for (const triggerFunction of [platformGuard, activePhoneTrigger]) {
      expect(triggerFunction).not.toBe("");
      expect(triggerFunction).toContain("security definer");
      expect(triggerFunction).toContain("set search_path = pg_catalog, public, auth");
      expect(triggerFunction.match(
        /public\.lock_tenant_onboarding_employee_phones/g,
      )).toHaveLength(1);
      expect(triggerFunction).not.toContain("pg_advisory_xact_lock");
    }
    expect(platformGuard).toContain("platform_operator_phone_conflict");
    expect(platformGuard).toContain("tg_op = 'update'");
    expect(platformGuard).toMatch(
      /array_append\(v_phones, old\.phone\)[\s\S]*array_append\(v_phones, new\.phone\)/,
    );
    expect(activePhoneTrigger).toContain("old.status = 'active'");
    expect(activePhoneTrigger).toContain("new.status = 'active'");

    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(normalized).toMatch(new RegExp(
        `revoke all on function public\\.lock_tenant_onboarding_employee_phones\\(text\\[\\]\\) from ${role};`,
      ));
      expect(normalized).toMatch(new RegExp(
        `revoke all on function public\\.lock_active_employee_phone_mutation\\(\\) from ${role};`,
      ));
    }
    expect(normalized).toContain(
      "revoke all on function public.guard_platform_employee_phone() from public;",
    );
    expect(normalized).toContain(
      "grant execute on function public.guard_platform_employee_phone() to service_role;",
    );

    const platformTriggerSql = normalizeSql(sql(platformOperatorMigration));
    const onboardingTriggerSql = normalizeSql(sql(legacyApprovalMigration));
    expect(platformTriggerSql).toMatch(
      /create trigger tr_guard_platform_employee_phone before insert or update of phone, tenant_id on public\.employees for each row execute function public\.guard_platform_employee_phone\(\);/,
    );
    expect(onboardingTriggerSql).toMatch(
      /create trigger tr_lock_active_employee_phone_mutation before insert or update of phone, status or delete on public\.employees for each row execute function public\.lock_active_employee_phone_mutation\(\);/,
    );
    expect("tr_guard_platform_employee_phone".localeCompare(
      "tr_lock_active_employee_phone_mutation",
    )).toBeLessThan(0);
  });

  test("uses the global phone-lock helper before both conflict checks", () => {
    const source = sql(migration);
    const activePhoneHelper = normalizeSql(extractFunction(
      source,
      "lock_and_check_active_employee_phone",
    ));
    const direct = normalizeSql(extractFunction(
      source,
      "create_tenant_with_default_template",
    ));
    const approval = normalizeSql(extractFunction(
      source,
      "approve_tenant_onboarding_application",
    ));
    const helperLock = activePhoneHelper.indexOf(
      "public.lock_tenant_onboarding_employee_phones",
    );
    const helperActivePhoneExists = activePhoneHelper.indexOf(
      "return exists ( select 1 from public.employees as employee",
    );

    expect(activePhoneHelper).not.toBe("");
    expect(activePhoneHelper.match(
      /public\.lock_tenant_onboarding_employee_phones/g,
    )).toHaveLength(1);
    expect(helperLock).toBeGreaterThan(0);
    expect(helperActivePhoneExists).toBeGreaterThan(helperLock);

    for (const [body, conflict] of [
      [direct, "message = 'tenant_admin_phone_exists'"],
      [approval, "'status', 'admin_phone_exists'"],
    ] as const) {
      const sharedHelperCall = body.indexOf(
        "public.lock_and_check_active_employee_phone",
      );
      const conflictHandling = body.indexOf(conflict, sharedHelperCall);

      expect(body.match(
        /public\.lock_and_check_active_employee_phone/g,
      )).toHaveLength(1);
      expect(sharedHelperCall).toBeGreaterThan(0);
      expect(conflictHandling).toBeGreaterThan(sharedHelperCall);
      expect(body).not.toContain(
        "public.lock_tenant_onboarding_employee_phones",
      );
      expect(body).not.toContain(
        "from public.employees as employee where employee.status = 'active'",
      );
      expect(body).not.toContain("'employee-phone:'");
      expect(body).not.toContain("'tenant-onboarding-admin-phone:'");
    }
  });
});
