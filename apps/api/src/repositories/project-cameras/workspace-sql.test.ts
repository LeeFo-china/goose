import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Explicit opt-in; creates its OWN network-isolated disposable PostgreSQL.
// From apps/api: CAMERA_WORKSPACE_SQL_TEST=1 bun test src/repositories/project-cameras/workspace-sql.test.ts
const sqlTest = process.env.CAMERA_WORKSPACE_SQL_TEST === "1" ? test : test.skip;
const migrationUrl = new URL("../../../../../supabase/migrations/20261013160058_camera_project_workspace.sql", import.meta.url);
function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

sqlTest("SQL migration enforces scope, complete counts and indexed bounded detail pages", async () => {
  const name = `gooes-camera-workspace-test-${process.pid}-${Date.now()}`;
  const start = docker(["run", "--rm", "--detach", "--network", "none", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine"]);
  expect(start.status, start.stderr).toBe(0);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) {
        ready = true;
        break;
      }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const migration = readFileSync(migrationUrl, "utf8");
    const setup = readFileSync(new URL("./fixtures/workspace-setup.sql", import.meta.url), "utf8");
    const assertions = readFileSync(new URL("./fixtures/workspace-assertions.sql", import.meta.url), "utf8");
    // Explain the actual migration query (not merely the opaque PL/pgSQL call).
    const body = migration.slice(migration.indexOf("  WITH scoped_projects"), migration.indexOf("  RETURN v_result;"))
      .replace("INTO v_result", "")
      .replaceAll("p_tenant_id", "'00000000-0000-4000-8000-000000000001'::uuid")
      .replaceAll("p_visible_project_ids", "NULL::uuid[]")
      .replaceAll("p_project_status", "NULL::text")
      .replaceAll("v_keyword", "NULL::text")
      .replaceAll("v_pattern", "NULL::text")
      .replaceAll("p_binding", "'all'")
      .replaceAll("p_page_size", "20")
      .replaceAll("p_page", "1");
    const sql = `BEGIN;\n${setup}\n${migration}\n${assertions}\n
      SELECT 'PROJECT_PLAN';
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${body}
      INSERT INTO public.project_cameras(tenant_id, project_id, status, can_view, vendor)
      SELECT '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
        'unknown', true, 'ezviz' FROM generate_series(1,1500);
      ANALYZE public.project_cameras;
      SELECT 'DETAIL_PLAN';
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, status FROM public.project_cameras
      WHERE tenant_id='00000000-0000-4000-8000-000000000001'
        AND project_id='00000000-0000-4000-8000-000000000101' AND deleted_at IS NULL
      ORDER BY sort_order, created_at, id LIMIT 20 OFFSET 20;
      ROLLBACK;`;
    const run = docker(["exec", "-i", name, "psql", "-h", "127.0.0.1", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], sql);
    expect(run.status, run.stderr).toBe(0);
    const projectPlan = JSON.parse(run.stdout.split("PROJECT_PLAN\n")[1]!.split("DETAIL_PLAN\n")[0]!);
    const detailPlan = JSON.parse(run.stdout.split("DETAIL_PLAN\n")[1]!);
    expect(JSON.stringify(projectPlan)).toContain("Index");
    expect(JSON.stringify(detailPlan)).toContain("idx_camera_workspace_tenant_project_page");
    expect(detailPlan[0].Plan["Actual Rows"]).toBe(20);
    console.info(`SQL fixture: 20,005 projects / 101,506 cameras; project query ${projectPlan[0]["Execution Time"]}ms; detail query ${detailPlan[0]["Execution Time"]}ms (20 rows via workspace index).`);
  } finally {
    const cleanup = docker(["rm", "--force", name]);
    expect(cleanup.status, cleanup.stderr).toBe(0);
  }
}, 60_000);
