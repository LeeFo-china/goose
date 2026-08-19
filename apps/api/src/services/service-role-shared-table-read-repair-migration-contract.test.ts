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
const normalizedSql = sql
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
    sql: readFileSync(new URL(name, migrationsDirectory), "utf8"),
  }));
const SHARED_TABLES = ["employees", "supplier_products"] as const;

function splitSqlList(value: string): string[] {
  return value.split(",").map((item) => item.trim().toLowerCase());
}

function revokesServiceRoleSharedTableRead(
  source: string,
  table: (typeof SHARED_TABLES)[number],
): boolean {
  for (const rawStatement of source.split(";")) {
    const statement = rawStatement.replace(/\s+/g, " ").trim();
    const revoke = statement.match(
      /\bREVOKE\s+(.+?)\s+ON\s+(.+?)\s+FROM\s+(.+)$/i,
    );
    if (!revoke) {
      continue;
    }

    const privileges = splitSqlList(revoke[1] ?? "");
    const target = (revoke[2] ?? "").trim();
    const roles = splitSqlList(
      (revoke[3] ?? "").replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, ""),
    );
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
      if (splitSqlList(schemaTarget[1] ?? "").includes("public")) {
        return true;
      }
      continue;
    }

    const tables = splitSqlList(target.replace(/^TABLE\s+/i, ""));
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

      expect(sql).toContain(grant);
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
    ] as const;

    expect(forbiddenRevokes.map((revoke) =>
      revokesServiceRoleSharedTableRead(revoke.sql, revoke.table)
    )).toEqual([true, true, true, true, true, true]);
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
    ] as const;

    expect(allowedRevokes.map((revoke) =>
      revokesServiceRoleSharedTableRead(revoke.sql, revoke.table)
    )).toEqual([false, false, false, false, false]);
  });

  test("does not widen browser or direct write privileges", () => {
    const grantStatements = (sql.match(/\bGRANT\b[^;]*;/gi) ?? []).join("\n");

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
