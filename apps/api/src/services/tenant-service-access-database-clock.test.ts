import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL(
  "../../../../supabase/migrations/20260811005555_create_platform_service_trials.sql",
  import.meta.url,
)), "utf8");

describe("tenant service access database clock contract", () => {
  test("loads one atomic access snapshot using one database timestamp", () => {
    const start = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.platform_service_trial_access_facts(",
    );
    const end = migration.indexOf("$$;", start);
    const body = migration.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(body).toContain("clock_timestamp() AS server_time");
    expect(body).not.toContain("p_now");
    for (const table of [
      "public.tenants",
      "public.tenant_service_contracts",
      "public.tenant_service_orders",
      "public.tenant_billing_subscriptions",
      "public.tenant_service_trials",
    ]) expect(body).toContain(table);
    expect(body).toContain("'server_time', access_clock.server_time");
    expect(body).toContain("'tenant_id', p_tenant_id");
    expect(body).toContain("access_clock.server_time >= trial.starts_at");
    expect(body).toContain("access_clock.server_time < trial.trial_ends_at");
    expect(body).toContain("access_clock.server_time < trial.grace_ends_at");
    expect(body).toContain("LIMIT 2");
    expect(body).toContain("WHEN candidate_count <= 1 THEN current_trial");
  });

  test("exposes the access snapshot only to service_role", () => {
    const signature = "public.platform_service_trial_access_facts(uuid)";
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
  });
});
