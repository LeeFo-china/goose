import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const MIGRATION_VERSION = "20260819125000";
const migrationName = `${MIGRATION_VERSION}_restore_service_role_shared_table_reads.sql`;
const migrationsDirectory = new URL(
  "../../../../supabase/migrations/",
  import.meta.url,
);
const migrationUrl = new URL(migrationName, migrationsDirectory);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const sqlWithoutComments = stripSqlComments(sql);
const normalizedSql = sqlWithoutComments
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")")
  .trim();
const laterMigrations = readdirSync(migrationsDirectory)
  .filter((name) =>
    name.endsWith(".sql") &&
    name.slice(0, MIGRATION_VERSION.length).localeCompare(MIGRATION_VERSION) > 0
  )
  .sort()
  .map((name) => ({
    name,
    sql: stripSqlComments(
      readFileSync(new URL(name, migrationsDirectory), "utf8"),
    ),
  }));
const SHARED_TABLES = ["employees", "supplier_products"] as const;

type SqlLexState =
  | "normal"
  | "single_quote"
  | "double_quote"
  | "dollar_quote"
  | "line_comment"
  | "block_comment";

function dollarQuoteDelimiterAt(source: string, index: number): string | null {
  return source.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0] ?? null;
}

function stripSqlComments(source: string): string {
  let result = "";
  let state: SqlLexState = "normal";
  let blockDepth = 0;
  let dollarDelimiter = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (state === "line_comment") {
      result += character === "\n" ? "\n" : " ";
      if (character === "\n") state = "normal";
      continue;
    }
    if (state === "block_comment") {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        result += "  ";
        index += 1;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        result += "  ";
        index += 1;
        if (blockDepth === 0) state = "normal";
      } else {
        result += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "dollar_quote") {
      if (source.startsWith(dollarDelimiter, index)) {
        result += dollarDelimiter;
        index += dollarDelimiter.length - 1;
        state = "normal";
      } else {
        result += character;
      }
      continue;
    }
    if (state === "single_quote" || state === "double_quote") {
      const quote = state === "single_quote" ? "'" : '"';
      result += character;
      if (state === "single_quote" && character === "\\" && next) {
        result += next;
        index += 1;
      } else if (character === quote && next === quote) {
        result += next;
        index += 1;
      } else if (character === quote) {
        state = "normal";
      }
      continue;
    }

    const delimiter = character === "$"
      ? dollarQuoteDelimiterAt(source, index)
      : null;
    if (delimiter) {
      dollarDelimiter = delimiter;
      result += delimiter;
      index += delimiter.length - 1;
      state = "dollar_quote";
    } else if (character === "'") {
      result += character;
      state = "single_quote";
    } else if (character === '"') {
      result += character;
      state = "double_quote";
    } else if (character === "-" && next === "-") {
      result += "  ";
      index += 1;
      state = "line_comment";
    } else if (character === "/" && next === "*") {
      result += "  ";
      index += 1;
      blockDepth = 1;
      state = "block_comment";
    } else {
      result += character;
    }
  }

  return result;
}

function splitSqlList(value: string): string[] {
  return value.split(",").map((item) => item.trim().toLowerCase());
}

function normalizeSqlIdentifier(value: string): string {
  return value.split(".").map((part) => {
    const identifier = part.trim();
    if (identifier.startsWith('"') && identifier.endsWith('"')) {
      return identifier.slice(1, -1).replace(/""/g, '"');
    }
    return identifier.toLowerCase();
  }).join(".");
}

function splitSqlIdentifiers(value: string): string[] {
  return value.split(",").map(normalizeSqlIdentifier);
}

function parseGrantees(value: string): string[] {
  const granteeList = value
    .replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, "")
    .replace(/\s+GRANTED\s+BY\s+.+$/i, "");

  return granteeList.split(",").map((grantee) =>
    normalizeSqlIdentifier(grantee.replace(/^\s*GROUP\s+/i, ""))
  );
}

function revokesServiceRoleSharedTableRead(
  source: string,
  table: (typeof SHARED_TABLES)[number],
): boolean {
  for (const rawStatement of stripSqlComments(source).split(";")) {
    const statement = rawStatement.replace(/\s+/g, " ").trim();
    const revoke = statement.match(
      /\bREVOKE\s+(.+?)\s+ON\s+(.+?)\s+FROM\s+(.+)$/i,
    );
    if (!revoke) {
      continue;
    }

    const privileges = splitSqlList(revoke[1] ?? "");
    const target = (revoke[2] ?? "").trim();
    const roles = parseGrantees(revoke[3] ?? "");
    const revokesSelect = privileges.some((privilege) =>
      privilege === "select" ||
      privilege === "all" ||
      privilege === "all privileges"
    );
    if (!revokesSelect || !roles.includes("service_role")) {
      continue;
    }

    const schemaTarget = target.match(/^ALL TABLES IN SCHEMA\s+(.+)$/i);
    if (schemaTarget) {
      if (splitSqlIdentifiers(schemaTarget[1] ?? "").includes("public")) {
        return true;
      }
      continue;
    }

    const tables = splitSqlIdentifiers(target.replace(/^TABLE\s+/i, ""));
    if (tables.includes(`public.${table}`)) {
      return true;
    }
  }

  return false;
}

describe("service role shared table read repair migration", () => {
  test("is a bounded forward-only transaction", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
  });

  test("terminates the privilege verification DO block as valid PL/pgSQL", () => {
    expect(sql).toMatch(/\bEND;\s*\$\$;/);
  });

  test("restores and verifies both service role table reads", () => {
    for (const table of SHARED_TABLES) {
      const grant = `GRANT SELECT ON TABLE public.${table} TO service_role;`;
      const privilegeCheck =
        `has_table_privilege('service_role', 'public.${table}', 'SELECT')`;

      expect(sqlWithoutComments).toContain(grant);
      expect(normalizedSql.indexOf(privilegeCheck)).toBeGreaterThan(
        normalizedSql.indexOf(grant),
      );
    }

    expect(sql.match(/ERRCODE = '42501'/g) ?? []).toHaveLength(2);
    expect(sql).toContain("MESSAGE = 'SERVICE_ROLE_EMPLOYEES_SELECT_REQUIRED'");
    expect(sql).toContain(
      "MESSAGE = 'SERVICE_ROLE_SUPPLIER_PRODUCTS_SELECT_REQUIRED'",
    );
  });

  test("detects service role shared-table read revoke variants", () => {
    const forbiddenRevokes = [
      {
        sql: "REVOKE SELECT ON public.employees FROM service_role;",
        table: "employees",
      },
      {
        sql: "REVOKE ALL ON TABLE public.supplier_products FROM service_role;",
        table: "supplier_products",
      },
      {
        sql: "REVOKE ALL PRIVILEGES ON public.audit_log, public.employees " +
          "FROM anon, service_role;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT, UPDATE ON TABLE public.employees " +
          "FROM service_role;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM service_role;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM service_role;",
        table: "supplier_products",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.employees FROM GROUP service_role;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.supplier_products " +
          "FROM service_role GRANTED BY CURRENT_USER;",
        table: "supplier_products",
      },
      {
        sql: 'REVOKE SELECT ON TABLE public."employees" FROM service_role;',
        table: "employees",
      },
      {
        sql: 'REVOKE SELECT ON TABLE public.supplier_products ' +
          'FROM "service_role";',
        table: "supplier_products",
      },
    ] as const;

    expect(forbiddenRevokes.map((revoke) =>
      revokesServiceRoleSharedTableRead(revoke.sql, revoke.table)
    )).toEqual([
      true, true, true, true, true,
      true, true, true, true, true,
    ]);
  });

  test("does not flag shared-table revocations from other roles", () => {
    const allowedRevokes = [
      {
        sql: "REVOKE SELECT ON TABLE public.employees FROM authenticated;",
        table: "employees",
      },
      {
        sql: "REVOKE ALL PRIVILEGES ON public.supplier_products FROM anon;",
        table: "supplier_products",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.employees FROM service_role_reader;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT, UPDATE ON TABLE public.supplier_products " +
          "FROM authenticated;",
        table: "supplier_products",
      },
      {
        sql: "REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.employees FROM GROUP authenticated;",
        table: "employees",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.supplier_products " +
          "FROM anon GRANTED BY CURRENT_USER;",
        table: "supplier_products",
      },
      {
        sql: "REVOKE SELECT ON TABLE public.employees " +
          "FROM GROUP service_role_reader GRANTED BY CURRENT_USER;",
        table: "employees",
      },
      {
        sql: 'REVOKE SELECT ON TABLE public.employees FROM "Service_Role";',
        table: "employees",
      },
      {
        sql: "-- REVOKE SELECT ON TABLE public.employees FROM service_role;",
        table: "employees",
      },
      {
        sql: "/* REVOKE SELECT ON TABLE public.supplier_products " +
          "FROM service_role; */",
        table: "supplier_products",
      },
    ] as const;

    expect(allowedRevokes.map((revoke) =>
      revokesServiceRoleSharedTableRead(revoke.sql, revoke.table)
    )).toEqual([
      false, false, false, false, false, false,
      false, false, false, false, false,
    ]);
  });

  test("strips SQL comments without changing quoted content", () => {
    const source = [
      "-- GRANT INSERT ON TABLE public.employees TO authenticated;",
      "SELECT '-- not a comment', '/* not a comment */';",
      'SELECT "employee--name", "supplier/*name*/";',
      "/* REVOKE SELECT ON TABLE public.supplier_products " +
        "FROM service_role; */",
    ].join("\n");
    const stripped = stripSqlComments(source);

    expect(stripped).not.toContain("GRANT INSERT");
    expect(stripped).not.toContain("REVOKE SELECT");
    expect(stripped).toContain("'-- not a comment'");
    expect(stripped).toContain("'/* not a comment */'");
    expect(stripped).toContain('"employee--name"');
    expect(stripped).toContain('"supplier/*name*/"');
  });

  test("does not widen browser or direct write privileges", () => {
    const grantStatements =
      (sqlWithoutComments.match(/\bGRANT\b[^;]*;/gi) ?? []).join("\n");

    expect(grantStatements).not.toMatch(
      /\bTO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b/i,
    );
    expect(grantStatements).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALL)\b/i);
  });

  test("is not revoked by a lexically later SQL migration", () => {
    for (const migration of laterMigrations) {
      for (const table of SHARED_TABLES) {
        expect(revokesServiceRoleSharedTableRead(migration.sql, table))
          .toBe(false);
      }
    }
  });
});
