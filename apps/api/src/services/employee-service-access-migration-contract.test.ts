import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260812070956_add_employee_service_access_bootstrap.sql",
);
const sql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").trim();

describe("employee service access bootstrap migration", () => {
  test("keeps one database clock and the exact access facts signature", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.platform_service_trial_access_facts( p_tenant_id uuid )",
    );
    expect(sql.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    expect(sql).toContain("WITH access_clock AS MATERIALIZED");
  });

  test("adds one bounded latest trial fact without replacing current access facts", () => {
    expect(sql).toContain("latest_trial_fact AS");
    expect(sql).toContain("'latest_trial'");
    expect(sql).toContain("ORDER BY trial.created_at DESC, trial.id DESC LIMIT 1");
    expect(sql).toContain("'current_trial'");
    expect(sql).not.toContain("EXECUTE format");
  });

  test("keeps the access facts function service-role only", () => {
    const signature = "public.platform_service_trial_access_facts(uuid)";
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    expect(sql).toContain("SECURITY DEFINER SET search_path = public, pg_temp");
  });
});
