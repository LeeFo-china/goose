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
  "EXEC_OFFICE", "MARKETING", "DESIGN", "PROJECT", "FINANCE", "SELF_MEDIA",
  "CUSTOMER_SERVICE",
] as const;

const enabledPosts = [
  "GENERAL_MANAGER", "SYSTEM_ADMIN", "SALES_CONSULTANT", "MARKETING_MANAGER",
  "DESIGN_DIRECTOR", "CHIEF_DESIGNER", "ENGINEERING_DIRECTOR", "CONSTRUCTION_SUPER",
  "HYDROPOWER_FOREMAN", "TILE_FOREMAN", "CARPENTRY_FOREMAN", "PAINT_FOREMAN",
  "MAINTENANCE_WORKER", "FINANCE_ACCOUNTANT", "FINANCE_MANAGER", "OPERATIONS_DIRECTOR",
  "NEW_MEDIA_OPERATOR", "VIDEO_EDITOR", "LIVE_STREAM_OPERATOR",
  "CUSTOMER_SERVICE_MANAGER", "CUSTOMER_SERVICE",
] as const;

const stableRoles = [
  "system_admin", "employee_base", "business_manager", "salesperson", "design_manage",
  "designer", "engineering_manager", "construction_supervisor", "construction_worker",
  "finance_base", "cashier",
] as const;

type NonAdminRole = Exclude<(typeof stableRoles)[number], "system_admin">;
type PermissionScope = "all" | "department" | "self";
type PermissionTriple = readonly [NonAdminRole, string, PermissionScope];

function permissionsFor(
  role: NonAdminRole,
  scope: PermissionScope,
  permissions: readonly string[],
): PermissionTriple[] {
  return permissions.map((permission) => [role, permission, scope]);
}

const expectedNonAdminPermissions = [
  ...permissionsFor("employee_base", "self", [
    "dashboard.read", "employee.read", "expense_request.create", "expense_request.read",
    "expense_request.submit", "task_center.read",
  ]),
  ...permissionsFor("business_manager", "all", ["customer.assign_owner", "project.read"]),
  ...permissionsFor("business_manager", "department", [
    "customer.create", "customer.phone.call", "customer.phone.copy", "customer.phone.view",
    "customer.read", "customer.update", "employee.read", "expense_request.approve_manager",
    "expense_request.read", "marketing_lead.read", "marketing_lead.update",
    "marketing_page.create", "marketing_page.delete", "marketing_page.publish",
    "marketing_page.read", "marketing_page.update", "project.create", "project.delete",
    "project.update",
  ]),
  ...permissionsFor("business_manager", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit", "project_acceptance.read",
    "task_center.read",
  ]),
  ...permissionsFor("salesperson", "self", [
    "customer.create", "customer.phone.call", "customer.phone.view", "customer.read",
    "customer.update", "dashboard.read", "expense_request.create", "expense_request.read",
    "expense_request.submit", "marketing_lead.read", "marketing_lead.update",
    "marketing_page.read", "project.create", "project.delete", "project.read", "project.update",
    "task_center.read",
  ]),
  ...permissionsFor("design_manage", "all", ["project_acceptance.read"]),
  ...permissionsFor("design_manage", "department", [
    "expense_request.approve_manager", "expense_request.read", "project.read",
  ]),
  ...permissionsFor("design_manage", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.read", "task_center.read",
  ]),
  ...permissionsFor("designer", "self", [
    "dashboard.read", "expense_request.create", "expense_request.read", "expense_request.submit",
    "project.read", "project.update", "project_log.create", "project_procedure.read",
    "project_acceptance.read", "task_center.read",
  ]),
  ...permissionsFor("engineering_manager", "all", [
    "project_acceptance.manage", "project_acceptance.reject", "project_acceptance.review",
    "project_acceptance.submit", "project.read", "project.update",
  ]),
  ...permissionsFor("engineering_manager", "department", [
    "expense_request.approve_manager", "expense_request.read", "project_acceptance.create",
    "project_acceptance.read", "project_log.create", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.read",
  ]),
  ...permissionsFor("engineering_manager", "self", [
    "customer.phone.call", "customer.phone.view", "dashboard.read", "employee.read",
    "expense_request.create", "expense_request.submit", "project_acceptance.update_own",
    "task_center.read",
  ]),
  ...permissionsFor("construction_supervisor", "department", [
    "project_acceptance.create", "project_acceptance.submit",
    "project_acceptance.update_own", "project.read",
  ]),
  ...permissionsFor("construction_supervisor", "self", [
    "dashboard.read", "expense_request.create", "expense_request.read", "expense_request.submit",
    "project_acceptance.read", "project_log.create", "project_procedure.adjust",
    "project_procedure.assign", "project_procedure.complete", "project_procedure.read",
    "project.update", "social_video_transcription.create", "social_video_transcription.manage",
    "task_center.read",
  ]),
  ...permissionsFor("construction_worker", "self", [
    "project_log.create", "project_procedure.assignee", "task_center.read",
  ]),
  ...permissionsFor("finance_base", "all", [
    "expense_request.approve_finance", "expense_request.pay", "expense_request.read",
    "finance.budget.manage", "finance.budget.view", "finance.closing.manage", "finance.closing.read",
    "finance.cost-allocation.manage", "finance.cost-category.manage", "finance.cost-category.view",
    "finance.dashboard.view", "finance.expense.pay", "finance.expense.review", "finance.ledger.view",
    "finance.payment.confirm", "finance.payment.create", "finance.receivable.manage",
    "finance.receivable.view", "finance.reconciliation.manage", "finance.reports.export",
    "finance.reports.read", "finance.view", "project_acceptance.read", "project.read",
    "project_referral.manage", "project_referral.read", "wechat_pay.notify.read", "wechat_pay.order.read",
  ]),
  ...permissionsFor("finance_base", "self", [
    "dashboard.read", "expense_request.create", "expense_request.submit",
    "task_center.read",
  ]),
  ...permissionsFor("cashier", "all", [
    "expense_request.approve_finance", "expense_request.pay", "expense_request.read",
    "finance.expense.pay", "finance.expense.review", "finance.ledger.view", "finance.payment.create",
    "finance.receivable.manage", "finance.receivable.view", "finance.view",
  ]),
  ...permissionsFor("cashier", "department", ["task_center.read"]),
  ...permissionsFor("cashier", "self", [
    "dashboard.read", "finance.budget.view", "finance.cost-allocation.manage",
    "finance.cost-category.manage", "finance.cost-category.view", "finance.dashboard.view",
  ]),
] as const;

const expectedDepartmentPostRules = [
  ["EXEC_OFFICE", "GENERAL_MANAGER"], ["EXEC_OFFICE", "SYSTEM_ADMIN"],
  ["MARKETING", "SALES_CONSULTANT"], ["MARKETING", "MARKETING_MANAGER"],
  ["DESIGN", "DESIGN_DIRECTOR"], ["DESIGN", "CHIEF_DESIGNER"],
  ["PROJECT", "ENGINEERING_DIRECTOR"], ["PROJECT", "CONSTRUCTION_SUPER"],
  ["PROJECT", "HYDROPOWER_FOREMAN"], ["PROJECT", "TILE_FOREMAN"],
  ["PROJECT", "CARPENTRY_FOREMAN"], ["PROJECT", "PAINT_FOREMAN"],
  ["PROJECT", "MAINTENANCE_WORKER"], ["FINANCE", "FINANCE_ACCOUNTANT"],
  ["FINANCE", "FINANCE_MANAGER"], ["SELF_MEDIA", "OPERATIONS_DIRECTOR"],
  ["SELF_MEDIA", "NEW_MEDIA_OPERATOR"], ["SELF_MEDIA", "VIDEO_EDITOR"],
  ["SELF_MEDIA", "LIVE_STREAM_OPERATOR"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE_MANAGER"],
  ["CUSTOMER_SERVICE", "CUSTOMER_SERVICE"],
] as const;

type SqlValue = string | number | boolean;
type SqlTuple = SqlValue[];

function sql(): string { return readFileSync(migration, "utf8"); }

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectTableMutations(source: string, table: string) {
  const tablePattern = `(?:public\\.)?${table}`;
  return source.split(";").flatMap((rawStatement) => {
    const statement = `${normalizeSql(rawStatement)};`;
    const direct = [...statement.matchAll(new RegExp(
      `\\b(insert\\s+into|update|delete\\s+from|merge\\s+into)` +
        `\\s+(?:only\\s+)?${tablePattern}\\b`, "gi",
    ))].map((match) => ({
      kind: match[1]?.split(/\s+/)[0]?.toLowerCase(),
      statement: `${statement.slice(match.index, -1).trim()};`,
    }));
    const isTruncate = new RegExp(
      `\\btruncate(?:\\s+table)?\\b[^;]*\\b(?:only\\s+)?${tablePattern}\\b`,
      "i",
    ).test(statement);
    return isTruncate ? [...direct, { kind: "truncate", statement }] : direct;
  });
}

function sortPermissionTriples(rows: readonly (readonly SqlValue[])[]): string[][] {
  return rows.map((row) => row.map(String))
    .sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

function withoutFunctionsAndComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\bCREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\b[\s\S]*?\bAS\s+(\$[a-z0-9_]*\$)[\s\S]*?\1\s*;/gi, "");
}

function extractFunction(source: string, name: string): string {
  const pattern = `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`;
  return source.match(new RegExp(pattern, "i"))?.[0] ?? "";
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
    const rolePermissionMutations = collectTableMutations(source, "role_permissions");
    const nonAdminGrants = rolePermissionMutations.filter(({ statement }) =>
      statement.includes("from resolved_non_admin_permissions")
    );
    const systemAdminGrants = rolePermissionMutations.filter((mutation) =>
      !nonAdminGrants.includes(mutation)
    );
    const adminRoleAssignments = [...normalized.matchAll(/select\b[^;]*\binto v_admin_role_id\b[^;]*;/g)].map((match) => match[0]);
    const resolution = normalizeSql(normalized.match(/resolved_non_admin_permissions as \(([\s\S]*?)\)\s*insert into (?:public\.)?role_permissions\b/)?.[1] ?? "");

    expect(expectedNonAdminPermissions).toHaveLength(162);
    expect(sortPermissionTriples(nonAdminPermissions)).toEqual(
      sortPermissionTriples(expectedNonAdminPermissions),
    );
    expect(rolePermissionMutations).toHaveLength(2);
    expect(rolePermissionMutations.every(({ kind }) => kind === "insert")).toBe(true);
    expect(nonAdminGrants).toHaveLength(1);
    expect(nonAdminGrants[0]?.statement).toBe(
      "insert into public.role_permissions (role_id, permission_id, access_scope) " +
        "select role_id, permission_id, access_scope from resolved_non_admin_permissions " +
        "on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;",
    );
    expect(systemAdminGrants).toHaveLength(1);
    expect(systemAdminGrants[0]?.statement).toBe(
      "insert into public.role_permissions (role_id, permission_id, access_scope) " +
        "select v_admin_role_id, permission.id, 'all' from public.permissions as permission " +
        "where permission.status = 'active' and permission.code not like 'platform.%' on conflict " +
        "(role_id, permission_id) do update set access_scope = excluded.access_scope;",
    );
    expect(adminRoleAssignments).toEqual([
      "select role.id into v_admin_role_id from public.roles as role " +
        "where role.tenant_id = p_tenant_id and role.code = 'system_admin' limit 1;",
    ]);
    expect(resolution).toBe(
      "select role.id as role_id, permission.id as permission_id, defaults.access_scope " +
        "from non_admin_permission_defaults as defaults " +
        "inner join public.roles as role on role.tenant_id = p_tenant_id " +
        "and role.code = defaults.role_code and role.status = 'active' " +
        "inner join public.permissions as permission on permission.code = defaults.permission_code " +
        "and permission.status = 'active'",
    );
    expect(normalized).toMatch(
      /select (?:pg_catalog\.)?count\(\*\)(?:::integer)? into v_expected_non_admin_permission_count from non_admin_permission_defaults;/,
    );
    expect(normalized).toMatch(
      /select (?:pg_catalog\.)?count\(\*\)(?:::integer)? into v_resolved_non_admin_permission_count from resolved_non_admin_permissions;/,
    );
    expect(normalized).toMatch(
      /if v_expected_non_admin_permission_count <> v_resolved_non_admin_permission_count then raise exception using [^;]*message = 'tenant_template_permission_missing'; end if;/,
    );
  });

  test("binds only the initialized administrator role and writes no overrides", () => {
    const source = sql();
    const employeeRoleMutations = collectTableMutations(source, "employee_roles");

    expect(collectTableMutations(source, "employee_permission_overrides")).toHaveLength(0);
    expect(employeeRoleMutations).toHaveLength(1);
    expect(employeeRoleMutations[0]?.kind).toBe("insert");
    expect(employeeRoleMutations[0]?.statement).toBe(
      "insert into public.employee_roles (employee_id, role_id) " +
        "values (v_admin_employee_id, v_admin_role_id) " +
        "on conflict (employee_id, role_id) do nothing;",
    );
  });

  test("keeps both commands security-definer and service-role-only", () => {
    const source = sql();
    for (const name of ["initialize_default_decoration_tenant", "create_tenant_with_default_template"]) {
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
        `GRANT\\s+(EXECUTE|ALL(?:\\s+PRIVILEGES)?)\\s+ON\\s+(?:FUNCTION|ROUTINE)\\s+` +
          `public\\.${name}\\([^;]+\\)\\s+TO\\s+([^;]+);`,
        "gi",
      ))].map((match) => [
        match[1]?.toLowerCase(),
        match[2]?.trim().toLowerCase(),
      ]);
      expect(grantees).toEqual([["execute", "service_role"]]);
    }
    expect(source).not.toMatch(
      /\bGRANT\b[^;]*\bON\s+ALL\s+(?:FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\b[^;]*;/i,
    );
    expect(source).not.toMatch(
      /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:FUNCTION|ROUTINE)\b[^;]*\bTO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b[^;]*;/i,
    );
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
    expect(returnValue.match(/'tenant'\s*,/g)).toHaveLength(1);
    expect(returnValue.match(/'initialization'\s*,/g)).toHaveLength(1);
    expect(returnValue).toMatch(
      /'tenant'\s*,\s*pg_catalog\.to_jsonb\(v_tenant\)/,
    );
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
    const valueSql = "(?:(?!\\b(?:select|from|union)\\b|'(?:departments|posts|department_posts|roles|role_permissions|system_admin_permission_rule)'\\s*,)[\\s\\S])*?";

    expect(audit.departments).toEqual(runtime.departments);
    expect(audit.posts).toEqual(runtime.posts);
    expect(audit.departmentPosts).toEqual(runtime.departmentPosts);
    expect(audit.roles).toEqual(runtime.roles);
    expect(audit.nonAdminPermissions).toEqual(runtime.nonAdminPermissions);
    expect(normalized).toMatch(/insert into public\.tenant_templates\s*\([^)]*payload[^)]*\)/);
    for (const [key, cte] of [
      ["departments", "audit_department_defaults"], ["posts", "audit_post_defaults"],
      ["department_posts", "audit_department_post_defaults"], ["roles", "audit_role_defaults"],
      ["role_permissions", "audit_non_admin_permission_defaults"],
    ] as const) {
      expect(normalized).toMatch(new RegExp(
        `'${key}'\\s*,\\s*\\(\\s*select\\s+(?:pg_catalog\\.)?jsonb_agg\\(${valueSql}\\)` +
          `\\s+from\\s+${cte}\\s*\\)`,
      ));
    }
    expect(normalized).not.toContain("'department_post_rules'");
    expect(normalized).not.toContain("'non_admin_permissions'");
    expect(normalized).toContain(
      "'system_admin_permission_rule', 'active_non_platform'",
    );
    expect(normalized).toContain("'default_decoration_company'");
    expect(normalized).toContain("'2026.08.30'");
  });

  test("does not mutate existing tenant organization or permissions at top level", () => {
    const source = sql();
    const topLevel = withoutFunctionsAndComments(source);
    for (const table of [
      "tenant_departments",
      "posts",
      "department_post_rules",
      "roles",
      "role_permissions",
      "employee_roles",
      "employee_permission_overrides",
    ]) {
      const mutations = collectTableMutations(topLevel, table);
      expect(mutations, `${table} top-level mutations`).toHaveLength(0);
    }
  });
});
