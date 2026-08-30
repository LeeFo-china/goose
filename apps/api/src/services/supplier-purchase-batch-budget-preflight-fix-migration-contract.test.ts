import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260830113800_fix_supplier_purchase_batch_budget_preflight.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("supplier purchase batch budget preflight forward fix", () => {
  test("replaces only the existing helper with the same security boundary", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.__gooes_supplier_purchase_batch_budget_preflight(",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION");
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
  });

  test("uses PostgreSQL greatest syntax without misqualifying special forms", () => {
    expect(migration).toContain("pg_catalog.sum(greatest(");
    expect(migration).not.toMatch(
      /pg_catalog\.(greatest|least|coalesce|nullif)\s*\(/i,
    );
  });
});
