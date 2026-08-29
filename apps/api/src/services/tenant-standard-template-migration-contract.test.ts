import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEPARTMENT_CODE_VALUES,
  DepartmentConfig,
  EMPLOYEE_POST_CODE_VALUES,
  EmployeePostConfig,
} from "@gooes/domain";
import {
  expectedDepartmentPosts,
  expectedDepartments,
  expectedNonAdminPermissions,
  expectedPosts,
  expectedRoles,
} from "./tenant-standard-template-contract-fixtures";

const migration = new URL(
  "../../../../supabase/migrations/20260830100000_standardize_new_tenant_organization_template.sql",
  import.meta.url,
);
const fixture = new URL(
  "./tenant-standard-template-contract-fixtures.ts",
  import.meta.url,
);

type SqlValue = string | number | boolean | null;
type SqlTuple = SqlValue[];

function sql(): string { return readFileSync(migration, "utf8"); }

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractPayloadSubquery(source: string, key: string): string {
  const normalized = normalizeSql(source);
  const marker = new RegExp(`'${key}'\\s*,\\s*\\(`).exec(normalized);
  expect(marker, `${key} payload value`).not.toBeNull();
  if (!marker) return "";
  const start = marker.index + marker[0].length;
  let depth = 1;
  let quoted = false;
  for (let index = start; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "'" && normalized[index + 1] === "'") { index += 1; continue; }
    if (character === "'") { quoted = !quoted; continue; }
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")" && --depth === 0) return normalized.slice(start, index).trim();
  }
  return "";
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

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function collectFunctionAcl(source: string, name: string): string[][] {
  const target = `(?:public\\.)?${name}\\([^;]+\\)`;
  const targetAcl = new RegExp(
    `^(?:revoke|grant)\\b[\\s\\S]*\\bon\\s+(?:function|routine)\\s+${target}(?=\\s|$)`,
  );
  return withoutComments(source).split(";").map(normalizeSql)
    .flatMap((statement) => {
      if (!targetAcl.test(statement)) return [];
      const acl = statement.match(new RegExp(
        `^(revoke|grant)\\s+(all(?:\\s+privileges)?|execute)\\s+on\\s+` +
          `(?:function|routine)\\s+${target}\\s+(from|to)\\s+(.+)$`,
      ));
      return [acl
        ? [acl[1] ?? "", acl[2]?.replace(/\s+/g, " ") ?? "", acl[3] ?? "", acl[4] ?? ""]
        : ["invalid", statement]];
    });
}

const expectedFunctionAcl = [
  ["revoke", "all", "from", "public"],
  ["revoke", "all", "from", "anon"],
  ["revoke", "all", "from", "authenticated"],
  ["revoke", "all", "from", "service_role"],
  ["grant", "execute", "to", "service_role"],
];

function sortPermissionTriples(rows: readonly (readonly SqlValue[])[]): string[][] {
  return rows.map((row) => row.map(String))
    .sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

function withoutFunctionsAndComments(source: string): string {
  return withoutComments(source)
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
      const tokenPattern = /'((?:''|[^'])*)'|\b(TRUE|FALSE)\b|(-?\d+)\b|\b(NULL)\b/gi;
      const values = [...tuple.matchAll(tokenPattern)].map((token) => {
        if (token[1] !== undefined) return token[1].replace(/''/g, "'");
        if (token[2] !== undefined) return token[2].toLowerCase() === "true";
        if (token[4] !== undefined) return null;
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

test("collects only executable function ACL statements", () => {
  const aclLines = [
    "REVOKE ALL ON FUNCTION public.acl_target(uuid) FROM PUBLIC;",
    "REVOKE ALL ON FUNCTION public.acl_target(uuid) FROM anon;",
    "REVOKE ALL ON FUNCTION public.acl_target(uuid) FROM authenticated;",
    "REVOKE ALL ON FUNCTION public.acl_target(uuid) FROM service_role;",
    "GRANT EXECUTE ON FUNCTION public.acl_target(uuid) TO service_role;",
  ];
  const aclSql = aclLines.join("\n");

  expect(collectFunctionAcl(aclSql, "acl_target")).toEqual(expectedFunctionAcl);
  expect(collectFunctionAcl(aclLines.map((line) => `-- ${line}`).join("\n"), "acl_target"))
    .toEqual([]);
  expect(collectFunctionAcl(`/* ${aclSql} */`, "acl_target")).toEqual([]);
  expect(collectFunctionAcl(
    "SELECT 'GRANT EXECUTE ON FUNCTION public.acl_target(uuid) TO service_role';",
    "acl_target",
  )).toEqual([]);
});

describe("standard new-tenant organization template migration", () => {
  test("pins the complete department, post, and department-post runtime matrix", () => {
    const source = sql();
    const config = runtimeConfig(source);

    expect(config.departments).toEqual(expectedDepartments);
    expect(config.posts).toEqual(expectedPosts);
    expect(config.posts.find((row) => row[0] === "SALES_CONSULTANT")?.[1])
      .toBe("客户经理");
    expect(config.posts.find((row) => row[0] === "FINANCE_ACCOUNTANT")?.[1])
      .toBe("会计");
    expect(config.departmentPosts).toEqual(expectedDepartmentPosts);
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
    expect(config.roles).toEqual(expectedRoles);
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
    const resolution = normalizeSql(normalized.match(
      /resolved_non_admin_permissions as \(([\s\S]*?)\)\s*,\s*permission_counts as/,
    )?.[1] ?? "");

    const actualPermissions = sortPermissionTriples(nonAdminPermissions);
    const expectedPermissions = sortPermissionTriples(expectedNonAdminPermissions);
    const actualKeys = new Set(actualPermissions.map((row) => row.join("\u0000")));
    const expectedKeys = new Set(expectedPermissions.map((row) => row.join("\u0000")));
    const missing = expectedPermissions.filter((row) => !actualKeys.has(row.join("\u0000")));
    const extra = actualPermissions.filter((row) => !expectedKeys.has(row.join("\u0000")));

    expect(expectedNonAdminPermissions).toHaveLength(162);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(actualPermissions).toEqual(expectedPermissions);
    expect(rolePermissionMutations).toHaveLength(2);
    expect(rolePermissionMutations.every(({ kind }) => kind === "insert")).toBe(true);
    expect(nonAdminGrants).toHaveLength(1);
    // Security contract: the immutable VALUES source drives both validation and insertion.
    expect(nonAdminGrants[0]?.statement).toContain(
      "insert into public.role_permissions (role_id, permission_id, access_scope) " +
        "select resolved.role_id, resolved.permission_id, resolved.access_scope " +
        "from resolved_non_admin_permissions as resolved " +
        "cross join permission_counts as counts " +
        "where counts.expected_count = counts.resolved_count " +
        "on conflict (role_id, permission_id) do update set " +
        "access_scope = excluded.access_scope returning role_permissions.id",
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
    expect(normalized).not.toContain("jsonb_to_recordset");
    expect(normalized).not.toContain("template.payload -> 'role_permissions'");
    expect(normalized).toMatch(
      /permission_counts as \( select \(select (?:pg_catalog\.)?count\(\*\) from non_admin_permission_defaults\) as expected_count, \(select (?:pg_catalog\.)?count\(\*\) from resolved_non_admin_permissions\) as resolved_count \)/,
    );
    expect(normalized).toMatch(
      /if v_expected_non_admin_permission_count <> v_resolved_non_admin_permission_count or v_inserted_non_admin_permission_count <> v_expected_non_admin_permission_count then raise exception using [^;]*message = 'tenant_template_permission_missing'; end if;/,
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

  test("keeps template and approval commands service-role-only", () => {
    const source = sql();
    for (const name of [
      "initialize_default_decoration_tenant",
      "create_tenant_with_default_template",
      "approve_tenant_onboarding_application",
    ]) {
      const body = extractFunction(source, name);
      expect(body).not.toBe("");
      expect(body).toMatch(
        /\bsecurity\s+definer\s+set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*auth\s+as\s+\$\$/i,
      );
      expect(collectFunctionAcl(source, name)).toEqual(expectedFunctionAcl);
    }
    expect(source).not.toMatch(
      /\bGRANT\b[^;]*\bON\s+ALL\s+(?:FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\b[^;]*;/i,
    );
    expect(source).not.toMatch(
      /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:FUNCTION|ROUTINE)\b[^;]*\bTO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b[^;]*;/i,
    );
  });

  test("freezes the 2026.08.30 department and post fixtures explicitly", () => {
    const source = readFileSync(fixture, "utf8");

    expect(source).not.toContain("DEPARTMENT_CODE_VALUES.map");
    expect(source).not.toContain("EMPLOYEE_POST_CODE_VALUES.map");
    expect(source).not.toContain("DepartmentConfig[code].label");
    expect(source).not.toContain("EmployeePostConfig[code].label");
    expect(expectedDepartments).toHaveLength(42);
    expect(expectedPosts).toHaveLength(48);
  });

  test("keeps the frozen 2026.08.30 fixtures compatible with the current domain", () => {
    expect(expectedDepartments.map(([code, label]) => [code, label])).toEqual(
      DEPARTMENT_CODE_VALUES.map((code) => [code, DepartmentConfig[code].label]),
    );
    expect(expectedPosts.map(([code, label]) => [code, label])).toEqual(
      EMPLOYEE_POST_CODE_VALUES.map((code) => [code, EmployeePostConfig[code].label]),
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
    const payloadStatement = source.match(
      /WITH\s+audit_department_defaults\b[\s\S]*?INSERT INTO public\.tenant_templates\b[\s\S]*?ON CONFLICT\s*\(\s*code\s*,\s*version\s*\)[\s\S]*?;/i,
    )?.[0] ?? "";
    expect(payloadStatement).not.toBe("");
    const runtime = runtimeConfig(source);
    const audit = auditConfig(payloadStatement);
    const normalized = normalizeSql(payloadStatement);

    expect(audit.departments).toEqual(runtime.departments);
    expect(audit.posts).toEqual(runtime.posts);
    expect(audit.departmentPosts).toEqual(runtime.departmentPosts);
    expect(audit.roles).toEqual(runtime.roles);
    expect(audit.nonAdminPermissions).toEqual(runtime.nonAdminPermissions);
    expect(normalized).toMatch(/insert into public\.tenant_templates\s*\([^)]*payload[^)]*\)/);
    for (const [key, cte, fields] of [
      ["departments", "audit_department_defaults", ["code", "alias_name", "enabled", "sort"]],
      ["posts", "audit_post_defaults", ["code", "alias_name", "status", "sort"]],
      ["department_posts", "audit_department_post_defaults", ["department_code", "post_code", "alias_name", "enabled", "sort"]],
      ["roles", "audit_role_defaults", ["code", "name", "description", "status"]],
      ["role_permissions", "audit_non_admin_permission_defaults", ["role_code", "permission_code", "access_scope"]],
    ] as const) {
      const fieldMapping = fields.map((field) => `'${field}'\\s*,\\s*${field}`).join("\\s*,\\s*");
      expect(normalized.match(new RegExp(`'${key}'\\s*,`, "g"))).toHaveLength(1);
      expect(extractPayloadSubquery(payloadStatement, key)).toMatch(new RegExp(
        `^select\\s+(?:pg_catalog\\.)?jsonb_agg\\(\\s*(?:pg_catalog\\.)?jsonb_build_object` +
          `\\(\\s*${fieldMapping}\\s*\\)(?:\\s+order\\s+by\\s+[a-z_][a-z0-9_]*` +
          `(?:\\s*,\\s*[a-z_][a-z0-9_]*)*)?\\s*\\)\\s+from\\s+${cte}$`,
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
