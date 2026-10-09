import { describe, expect, test } from "bun:test";
import { Errors } from "@/errors/error-factory";

// Explicit opt-in, pinned to an owned disposable container/database, never env DB credentials.
// Prerequisite: load the installed schema and 20261009190000 migration into this database.
// TENANT_ACTIVITY_POSTGRES_TEST=1 bun test src/repositories/tenant-activity-postgres.test.ts
const enabled = process.env.TENANT_ACTIVITY_POSTGRES_TEST === "1";
const command = ["docker", "exec", "-i", "gooes-tenant-activity-verify", "psql", "-X", "-q", "-At",
  "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "tenant_activity_full"];

async function sql(statement: string): Promise<string> {
  const process = Bun.spawn(command, { stdin: new Blob([statement]), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  if (code !== 0) throw Errors.dbError(`隔离 PostgreSQL 验证失败: ${stderr}`);
  return stdout.trim();
}

describe.skipIf(!enabled)("isolated PostgreSQL tenant activity", () => {
  test("SQL rollback suite: semantics, RLS, 100-tenant bound and EXPLAIN", async () => {
    const testSql = await Bun.file(new URL("../../../../supabase/tests/tenant_activity_metrics.sql", import.meta.url)).text();
    const output = await sql(testSql);
    expect(output).toContain("tenant_activity_daily_pkey");
    expect(output).toContain("Index Cond:");
    // Includes final ROLLBACK: generated fixture rows must not survive.
    expect(await sql("SELECT count(*) FROM public.tenants WHERE slug LIKE 'activity-%';")).toBe("0");
  }, 30_000);

  test("24 concurrent retries increment once; 24 distinct writes are not lost", async () => {
    const tenant = crypto.randomUUID();
    const employee = crypto.randomUUID();
    const initialStart = await sql("SELECT coalesce(collection_started_at::text,'') FROM public.tenant_activity_collection_config;");
    // This suite expects an unused fixture DB so first-record activation is exercised.
    expect(initialStart).toBe("");
    await sql(`INSERT INTO public.tenants(id,name,slug) VALUES ('${tenant}','Concurrency','concurrency-${tenant}');
      INSERT INTO public.employees(id,tenant_id,status) VALUES ('${employee}','${tenant}','active');`);
    try {
      const record = (key: string) => sql(`SET ROLE service_role;
        SELECT public.record_tenant_activity('${tenant}','${employee}','admin_web','customer_created','${key}');`);
      const retries = await Promise.all(Array.from({ length: 24 }, () => record("same-event")));
      expect(retries.filter((result) => result === "t")).toHaveLength(1);
      expect(retries.filter((result) => result === "f")).toHaveLength(23);
      const unique = await Promise.all(Array.from({ length: 24 }, (_, i) => record(`unique-${i}`)));
      expect(unique.filter((result) => result === "t")).toHaveLength(24);
      const result: unknown = JSON.parse(await sql(`SET ROLE service_role;
        SELECT public.get_tenant_activity_summaries(ARRAY['${tenant}'::uuid]);`));
      expect(result).toMatchObject([{ active_employee_count: 1, active_days: 1,
        business_actions: { customer_created: 25 } }]);
      expect(await sql(`SELECT count(*) FROM public.tenant_activity_events WHERE tenant_id='${tenant}';`)).toBe("25");
      expect(await sql("SELECT collection_started_at IS NOT NULL FROM public.tenant_activity_collection_config;")).toBe("t");
    } finally {
      // Other sessions need committed fixtures; clean only our synthetic IDs afterwards.
      await sql(`DELETE FROM public.employees WHERE id='${employee}';
        DELETE FROM public.tenants WHERE id='${tenant}';
        UPDATE public.tenant_activity_collection_config SET collection_started_at=NULL;`);
    }
  }, 30_000);
});
