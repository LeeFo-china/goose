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

describe("service role shared table read repair migration", () => {
  test("is a bounded forward-only transaction", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
  });

  test("restores and verifies both service role table reads", () => {
    const tables = ["employees", "supplier_products"] as const;

    for (const table of tables) {
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

  test("does not widen browser or direct write privileges", () => {
    const grantStatements = (sql.match(/\bGRANT\b[^;]*;/gi) ?? []).join("\n");

    expect(grantStatements).not.toMatch(
      /\bTO\s+[^;]*\b(?:PUBLIC|anon|authenticated)\b/i,
    );
    expect(grantStatements).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALL)\b/i);
  });

  test("is not revoked by a lexically later SQL migration", () => {
    for (const migration of laterMigrations) {
      expect(migration.sql).not.toMatch(
        /\bREVOKE\s+SELECT\s+ON\s+TABLE\s+public\.employees\b/i,
      );
      expect(migration.sql).not.toMatch(
        /\bREVOKE\s+SELECT\s+ON\s+TABLE\s+public\.supplier_products\b/i,
      );
    }
  });
});
