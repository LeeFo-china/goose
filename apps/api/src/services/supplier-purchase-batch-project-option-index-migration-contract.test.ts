import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../../../supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql", import.meta.url);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

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
  });

  test("builds the project option filter index concurrently with rollback guidance", () => {
    expect(sql).toContain(
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS\n" +
        "  projects_tenant_updated_id_purchase_batch_idx\n" +
        "ON public.projects(tenant_id, updated_at DESC, id DESC);",
    );
    expect(sql).toMatch(/-- Rollback:[\s\S]*DROP INDEX CONCURRENTLY/);
  });
});
