import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../../../supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql", import.meta.url);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function normalizeExecutableStatements(value: string): string[] {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

describe("supplier purchase batch project option index migration", () => {
  test("declares the nontransactional concurrent-index protocol", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const [mode, expectedIndex] = sql.split(/\r?\n/);
    expect(mode).toBe("-- gooes:migration-mode=nontransactional");
    expect(expectedIndex).toBe(
      "-- gooes:expected-index=public.projects_tenant_updated_id_purchase_batch_idx|public.projects|false|btree|tenant_id,updated_at,id|pg_catalog.uuid_ops,pg_catalog.timestamptz_ops,pg_catalog.uuid_ops|null",
    );
    expect(sql).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
    expect(sql).toContain("SET lock_timeout = '5s';");
    expect(sql).toContain("SET statement_timeout = '30min';");
    expect(sql).toContain("RESET statement_timeout;");
    expect(sql).toContain("RESET lock_timeout;");
  });

  test("contains only the ordered nontransactional index statements", () => {
    const executableStatements = normalizeExecutableStatements(sql);

    expect(executableStatements).toEqual([
      "SET lock_timeout = '5s'",
      "SET statement_timeout = '30min'",
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_tenant_updated_id_purchase_batch_idx ON public.projects(tenant_id, updated_at DESC, id DESC)",
      "RESET statement_timeout",
      "RESET lock_timeout",
    ]);
    expect(executableStatements.join(";\n")).not.toMatch(
      /\b(?:DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|END|ABORT)\b/i,
    );
  });

  test("builds the project option filter index concurrently with forward-only rollback guidance", () => {
    expect(sql).toContain(
      "-- Existing projects may already contain substantial data. Build this index\n" +
        "-- without a write-blocking ShareLock while the project option API stays live.",
    );
    expect(sql).toContain(
      "-- Failure/retry: release tooling validates pg_index readiness and removes only\n" +
        "-- this listed INVALID index concurrently before retrying.",
    );
    expect(sql).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS\n" +
        "  projects_tenant_updated_id_purchase_batch_idx\n" +
        "ON public.projects(tenant_id, updated_at DESC, id DESC);",
    );
    expect(sql).toContain(
      "-- Rollback: forward-only. After reverting the filtered API revision, leave this\n" +
        "-- additive index in place; retaining it is safe. Any later removal requires a\n" +
        "-- separately reviewed timestamped migration after release tooling supports\n" +
        "-- expected-absence/drop contracts.",
    );
  });
});
