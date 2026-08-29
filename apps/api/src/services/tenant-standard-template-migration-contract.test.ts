import { describe, expect, test } from "bun:test";
import {
  DEPARTMENT_CODE_VALUES,
  EMPLOYEE_POST_CODE_VALUES,
} from "@gooes/domain";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql",
  import.meta.url,
);

const enabledDepartments = [
  "EXEC_OFFICE",
  "MARKETING",
  "DESIGN",
  "PROJECT",
  "FINANCE",
  "SELF_MEDIA",
  "CUSTOMER_SERVICE",
] as const;

const enabledPosts = [
  "GENERAL_MANAGER",
  "SYSTEM_ADMIN",
  "SALES_CONSULTANT",
  "MARKETING_MANAGER",
  "DESIGN_DIRECTOR",
  "CHIEF_DESIGNER",
  "ENGINEERING_DIRECTOR",
  "CONSTRUCTION_SUPER",
  "HYDROPOWER_FOREMAN",
  "TILE_FOREMAN",
  "CARPENTRY_FOREMAN",
  "PAINT_FOREMAN",
  "MAINTENANCE_WORKER",
  "FINANCE_ACCOUNTANT",
  "FINANCE_MANAGER",
  "OPERATIONS_DIRECTOR",
  "NEW_MEDIA_OPERATOR",
  "VIDEO_EDITOR",
  "LIVE_STREAM_OPERATOR",
  "CUSTOMER_SERVICE_MANAGER",
  "CUSTOMER_SERVICE",
] as const;

const stableRoles = [
  "system_admin",
  "employee_base",
  "business_manager",
  "salesperson",
  "design_manage",
  "designer",
  "engineering_manager",
  "construction_supervisor",
  "construction_worker",
  "finance_base",
  "cashier",
] as const;

const expectedDepartmentPostRules = [
  ["EXEC_OFFICE", "GENERAL_MANAGER"],
  ["EXEC_OFFICE", "SYSTEM_ADMIN"],
  ["MARKETING", "SALES_CONSULTANT"],
  ["MARKETING", "MARKETING_MANAGER"],
  ["DESIGN", "DESIGN_DIRECTOR"],
  ["DESIGN", "CHIEF_DESIGNER"],
  ["PROJECT", "ENGINEERING_DIRECTOR"],
  ["PROJECT", "CONSTRUCTION_SUPER"],
  ["PROJECT", "HYDROPOWER_FOREMAN"],
  ["PROJECT", "TILE_FOREMAN"],
  ["PROJECT", "CARPENTRY_FOREMAN"],
  ["PROJECT", "PAINT_FOREMAN"],
  ["PROJECT", "MAINTENANCE_WORKER"],
  ["FINANCE", "FINANCE_ACCOUNTANT"],
  ["FINANCE", "FINANCE_MANAGER"],
  ["SELF_MEDIA", "OPERATIONS_DIRECTOR"],
  ["SELF_MEDIA", "NEW_MEDIA_OPERATOR"],
  ["SELF_MEDIA", "VIDEO_EDITOR"],
  ["SELF_MEDIA", "LIVE_STREAM_OPERATOR"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_MANAGER"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE"],
] as const;

type SqlValue = string | number | boolean;
type SqlTuple = SqlValue[];

function sql(): string {
  return readFileSync(migration, "utf8");
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractFunction(source: string, name: string): string {
  return source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ))?.[0] ?? "";
}

function extractValuesCte(
  source: string,
  name: string,
  columns: readonly string[],
): string {
  const columnPattern = columns.join("\\s*,\\s*");
  const block = source.match(new RegExp(
    `(?:\\bWITH|,)\\s*${name}\\s*\\(\\s*${columnPattern}\\s*\\)` +
      `\\s+AS\\s*\\(\\s*VALUES\\s*([\\s\\S]*?)\\s*\\)` +
      `\\s*(?=,\\s*[a-z_][a-z0-9_]*\\s*(?:\\(|AS\\b)|\\s*(?:INSERT|SELECT)\\b)`,
    "i",
  ))?.[1] ?? "";
  expect(block, `${name} VALUES CTE`).not.toBe("");
  return block;
}

function parseValues(block: string, width: number): SqlTuple[] {
  return [...block.matchAll(/\(\s*([\s\S]*?)\s*\)(?=\s*(?:,|$))/g)]
    .map((tupleMatch) => {
      const tuple = tupleMatch[1] ?? "";
      const tokenPattern = /'((?:''|[^'])*)'|\b(TRUE|FALSE)\b|(-?\d+)\b/gi;
      const values = [...tuple.matchAll(tokenPattern)].map((token) => {
        if (token[1] !== undefined) return token[1].replace(/''/g, "'");
        if (token[2] !== undefined) return token[2].toLowerCase() === "true";
        return Number(token[3]);
      });
      const residue = tuple.replace(tokenPattern, "").replaceAll(",", "").trim();
      expect(residue, `unsupported SQL tuple token in (${tuple})`).toBe("");
      expect(values, `unexpected SQL tuple width in (${tuple})`).toHaveLength(width);
      return values;
    });
}

function runtimeConfig(source: string) {
  const initializer = extractFunction(source, "initialize_default_decoration_tenant");
  expect(initializer).not.toBe("");
  return {
    initializer,
    departments: parseValues(extractValuesCte(initializer, "department_defaults", [
      "code", "alias_name", "enabled", "sort",
    ]), 4),
    posts: parseValues(extractValuesCte(initializer, "post_defaults", [
      "code", "alias_name", "status", "sort",
    ]), 4),
    departmentPosts: parseValues(extractValuesCte(
      initializer,
      "department_post_defaults",
      ["department_code", "post_code", "alias_name", "enabled", "sort"],
    ), 5),
    roles: parseValues(extractValuesCte(initializer, "role_defaults", [
      "code", "name", "description", "status",
    ]), 4),
    nonAdminPermissions: parseValues(extractValuesCte(
      initializer,
      "non_admin_permission_defaults",
      ["role_code", "permission_code", "access_scope"],
    ), 3),
  };
}

function auditConfig(source: string) {
  return {
    departments: parseValues(extractValuesCte(source, "audit_department_defaults", [
      "code", "alias_name", "enabled", "sort",
    ]), 4),
    posts: parseValues(extractValuesCte(source, "audit_post_defaults", [
      "code", "alias_name", "status", "sort",
    ]), 4),
    departmentPosts: parseValues(extractValuesCte(
      source,
      "audit_department_post_defaults",
      ["department_code", "post_code", "alias_name", "enabled", "sort"],
    ), 5),
    roles: parseValues(extractValuesCte(source, "audit_role_defaults", [
      "code", "name", "description", "status",
    ]), 4),
    nonAdminPermissions: parseValues(extractValuesCte(
      source,
      "audit_non_admin_permission_defaults",
      ["role_code", "permission_code", "access_scope"],
    ), 3),
  };
}

describe("standard new-tenant organization template migration", () => {
  test("pins the complete department, post, and department-post runtime matrix", () => {
    const source = sql();
    const config = runtimeConfig(source);

    expect(config.departments.map((row) => row[0]).sort()).toEqual(
      [...DEPARTMENT_CODE_VALUES].sort(),
    );
    expect(config.departments.filter((row) => row[2] === true).map((row) => row[0]))
      .toEqual([...enabledDepartments]);
    expect(config.departments.filter((row) => row[2] === true)).toHaveLength(7);

    expect(config.posts.map((row) => row[0]).sort()).toEqual(
      [...EMPLOYEE_POST_CODE_VALUES].sort(),
    );
    expect(config.posts.filter((row) => row[2] === 1).map((row) => row[0]).sort())
      .toEqual([...enabledPosts].sort());
    expect(config.posts.filter((row) => row[2] === 1)).toHaveLength(21);
    expect(config.posts.find((row) => row[0] === "SALES_CONSULTANT")?.[1])
      .toBe("销售专员");
    expect(config.posts.find((row) => row[0] === "FINANCE_ACCOUNTANT")?.[1])
      .toBe("财务专员");

    expect(config.departmentPosts).toHaveLength(21);
    expect(config.departmentPosts.map((row) => [row[0], row[1]])).toEqual(
      expectedDepartmentPostRules,
    );
    expect(config.departmentPosts.every((row) => row[3] === true)).toBe(true);
    expect(config.departmentPosts.find((row) => row[1] === "SALES_CONSULTANT")?.[2])
      .toBe("销售专员");
    expect(config.departmentPosts.find((row) => row[1] === "FINANCE_ACCOUNTANT")?.[2])
      .toBe("财务专员");
    expect(source).not.toMatch(/POST_(?:BBABBD4D14C4|FA1BC5A5BB7D)/);
  });

  test("pins the template identity and exact stable role set", () => {
    const source = sql();
    const config = runtimeConfig(source);

    expect(config.initializer).toContain("'default_decoration_company'");
    expect(config.initializer).toContain("'2026.08.30'");
    expect(config.roles.map((row) => row[0])).toEqual([...stableRoles]);
    expect(config.roles.every((row) => row[3] === "active")).toBe(true);
  });

  test("resolves explicit non-admin permissions and fails closed on missing codes", () => {
    const source = sql();
    const { initializer, nonAdminPermissions } = runtimeConfig(source);
    const normalized = normalizeSql(initializer);
    const configuredRoles = [...new Set(nonAdminPermissions.map((row) => row[0]))].sort();
    const rolePermissionInserts = [
      ...initializer.matchAll(/INSERT INTO public\.role_permissions\b[\s\S]*?;/gi),
    ].map((match) => normalizeSql(match[0]));
    const systemAdminGrant = rolePermissionInserts.find((statement) =>
      statement.includes("v_admin_role_id") &&
      statement.includes("from public.permissions as permission")
    ) ?? "";
    const resolutionStart = normalized.indexOf(
      "resolved_non_admin_permissions as (",
    );
    const resolutionEnd = normalized.indexOf(
      "insert into public.role_permissions",
      resolutionStart,
    );
    const resolution = normalized.slice(resolutionStart, resolutionEnd);

    expect(nonAdminPermissions.length).toBeGreaterThan(0);
    expect(configuredRoles).toEqual([...stableRoles.slice(1)].sort());
    expect(nonAdminPermissions.every((row) => row[0] !== "system_admin")).toBe(true);
    expect(nonAdminPermissions.every((row) =>
      typeof row[1] === "string" && row[1] !== "" &&
      ["self", "department", "assigned", "all"].includes(String(row[2]))
    )).toBe(true);
    expect(systemAdminGrant).toMatch(
      /from public\.permissions as permission where permission\.status = 'active' and permission\.code not like 'platform\.%'/,
    );
    expect(resolutionStart).toBeGreaterThan(-1);
    expect(resolutionEnd).toBeGreaterThan(resolutionStart);
    expect(resolution).toContain("from non_admin_permission_defaults");
    expect(resolution).toContain("join public.roles");
    expect(resolution).toContain("join public.permissions");
    expect(normalized).toMatch(
      /insert into public\.role_permissions[\s\S]*from resolved_non_admin_permissions/,
    );
    expect(normalized).toMatch(
      /(?:pg_catalog\.)?count\(\*\)::integer[\s\S]*from non_admin_permission_defaults/,
    );
    expect(normalized).toMatch(
      /(?:pg_catalog\.)?count\(\*\)::integer[\s\S]*from resolved_non_admin_permissions/,
    );
    expect(normalized).toContain("v_expected_non_admin_permission_count");
    expect(normalized).toContain("v_resolved_non_admin_permission_count");
    expect(normalized).toMatch(
      /if v_expected_non_admin_permission_count <> v_resolved_non_admin_permission_count then[\s\S]*message = 'tenant_template_permission_missing'/,
    );
  });

  test("binds only the initialized administrator role and writes no overrides", () => {
    const source = sql();
    const { initializer } = runtimeConfig(source);
    const employeeRoleInserts = [
      ...source.matchAll(/INSERT INTO public\.employee_roles\b[\s\S]*?;/gi),
    ].map((match) => normalizeSql(match[0]));

    expect(source).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.employee_permission_overrides\b/i,
    );
    expect(employeeRoleInserts).toHaveLength(1);
    expect(employeeRoleInserts[0]).toMatch(
      /insert into public\.employee_roles\s*\(\s*employee_id\s*,\s*role_id\s*\)\s*values\s*\(\s*v_admin_employee_id\s*,\s*v_admin_role_id\s*\)/,
    );
    expect(normalizeSql(initializer)).toMatch(
      /select role\.id into v_admin_role_id from public\.roles as role where role\.tenant_id = p_tenant_id and role\.code = 'system_admin'/,
    );
  });

  test("keeps both commands security-definer and service-role-only", () => {
    const source = sql();
    for (const name of [
      "initialize_default_decoration_tenant",
      "create_tenant_with_default_template",
    ]) {
      const body = extractFunction(source, name);
      expect(body).not.toBe("");
      expect(body).toMatch(/SECURITY DEFINER/i);
      expect(body).toMatch(/SET search_path = pg_catalog, public, auth/i);
      for (const role of ["PUBLIC", "anon", "authenticated"]) {
        expect(source).toMatch(new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\)\\s+FROM ${role};`,
          "i",
        ));
      }
      const grantees = [...source.matchAll(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\)\\s+TO ([a-z_]+);`,
        "gi",
      ))].map((match) => match[1]?.toLowerCase());
      expect(grantees).toEqual(["service_role"]);
    }
  });

  test("creates a tenant through the initializer and returns both results", () => {
    const body = extractFunction(sql(), "create_tenant_with_default_template");
    const normalized = normalizeSql(body);
    const returnValue = normalized.match(
      /return (?:pg_catalog\.)?jsonb_build_object\(([\s\S]*?)\); end;/,
    )?.[1] ?? "";

    expect(normalized).toMatch(
      /v_initialization := public\.initialize_default_decoration_tenant\(/,
    );
    expect(returnValue).toMatch(/'tenant'\s*,/);
    expect(returnValue).toMatch(/'initialization'\s*,\s*v_initialization/);
    expect(normalized).toContain("'default_decoration_company'");
    expect(normalized).toContain("'2026.08.30'");
  });

  test("keeps the audit payload item-for-item aligned with runtime configuration", () => {
    const source = sql();
    const runtime = runtimeConfig(source);
    const audit = auditConfig(source);
    const payloadStatement = source.match(
      /WITH\s+audit_department_defaults\b[\s\S]*?INSERT INTO public\.tenant_templates\b[\s\S]*?ON CONFLICT\s*\(\s*code\s*,\s*version\s*\)[\s\S]*?;/i,
    )?.[0] ?? "";
    const normalized = normalizeSql(payloadStatement);

    expect(audit.departments).toEqual(runtime.departments);
    expect(audit.posts).toEqual(runtime.posts);
    expect(audit.departmentPosts).toEqual(runtime.departmentPosts);
    expect(audit.roles).toEqual(runtime.roles);
    expect(audit.nonAdminPermissions).toEqual(runtime.nonAdminPermissions);
    expect(normalized).toMatch(/insert into public\.tenant_templates\s*\([^)]*payload[^)]*\)/);
    for (const [key, cte] of [
      ["departments", "audit_department_defaults"],
      ["posts", "audit_post_defaults"],
      ["department_post_rules", "audit_department_post_defaults"],
      ["roles", "audit_role_defaults"],
      ["non_admin_permissions", "audit_non_admin_permission_defaults"],
    ] as const) {
      expect(normalized).toContain(`'${key}'`);
      expect(normalized).toContain(`from ${cte}`);
    }
    expect(normalized).toContain(
      "'system_admin_permission_rule', 'active_non_platform'",
    );
    expect(normalized).toContain("'default_decoration_company'");
    expect(normalized).toContain("'2026.08.30'");
  });

  test("does not unconditionally rewrite existing tenant organization or permissions", () => {
    const source = sql();
    const topLevel = source
      .replace(/CREATE OR REPLACE FUNCTION public\.[a-z0-9_]+\([\s\S]*?\n\$\$;/gi, "")
      .replace(/--.*$/gm, "");
    for (const table of [
      "tenant_departments",
      "posts",
      "department_post_rules",
      "roles",
      "role_permissions",
      "employee_roles",
      "employee_permission_overrides",
    ]) {
      const writes = [...topLevel.matchAll(new RegExp(
        `\\b(?:UPDATE\\s+public\\.${table}\\s+SET|DELETE\\s+FROM\\s+public\\.${table}\\b)[\\s\\S]*?;`,
        "gi",
      ))];
      for (const write of writes) {
        expect(normalizeSql(write[0]), `${table} top-level write`).toMatch(/\bwhere\b/);
      }
    }
  });
});
