import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Same explicit opt-in / network-isolated disposable PostgreSQL harness as workspace-sql.test.ts.
const sqlTest = process.env.CAMERA_WORKSPACE_SQL_TEST === "1" ? test : test.skip;
const migrations = new URL("../../../../../supabase/migrations/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, migrations), "utf8");
function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

sqlTest("atomic camera binding: real SQL rollback, scope, legacy payloads and concurrent boundaries", async () => {
  const name = `gooes-camera-binding-test-${process.pid}-${Date.now()}`;
  const start = docker(["run", "--rm", "--detach", "--network", "none", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine"]);
  expect(start.status, start.stderr).toBe(0);
  const args = ["exec", "-i", name, "psql", "-h", "127.0.0.1", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"];
  const run = (sql: string) => docker(args, sql);
  const check = (sql: string) => { const result = run(sql); expect(result.status, result.stderr).toBe(0); return result.stdout.trim(); };
  const sessions: ReturnType<typeof Bun.spawn>[] = [];
  const session = (label: string, sql: string) => {
    const child = Bun.spawn(["docker", ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    child.stdin.write(`SET application_name = '${label}'; SET statement_timeout='8s'; ${sql}\n`);
    sessions.push(child);
    return child;
  };
  const waitFor = async (condition: string) => {
    for (let i = 0; i < 100; i++) {
      if (check(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE ${condition});`) === "t") return;
      await Bun.sleep(20);
    }
    expect(false, `session never reached: ${condition}`).toBe(true);
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) { ready = true; break; }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const setup = readFileSync(new URL("./fixtures/binding-setup.sql", import.meta.url), "utf8").split("-- Test helpers");
    check(setup[0]! + read("20260501093000_create_project_cameras.sql")
      + read("20260507123000_add_tencent_iot_video_project_cameras.sql").split("INSERT INTO public.system_settings")[0]
      + read("20260509170000_tenant_scope_project_cameras.sql")
      + read("20260512120000_create_tenant_devices.sql")
      + read("20260925090000_add_tenant_device_hardware_serial.sql"));
    const migrationName = "20261014091000_atomic_project_camera_binding.sql";
    if (existsSync(new URL(migrationName, migrations))) check(read(migrationName));
    // Meaningful RED before implementation: the required transactional boundary is absent.
    expect(check("SELECT to_regprocedure('public.bind_project_camera(uuid,uuid,jsonb,uuid)') IS NOT NULL;")).toBe("t");
    check("-- Test helpers" + setup[1]!);
    check(readFileSync(new URL("./fixtures/binding-assertions.sql", import.meta.url), "utf8"));

    // Verify the ownership probe remains a bounded index lookup as the asset pool grows.
    const ownershipPlan = JSON.parse(check(`BEGIN;
      INSERT INTO tenant_devices(tenant_id,vendor,vendor_device_serial,vendor_channel_id)
      SELECT '00000000-0000-4000-8000-000000000002','tencent_iotvideo_industry','ownership-plan-' || n,NULL
      FROM generate_series(1,5000) AS n;
      ANALYZE tenant_devices;
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT 1 FROM tenant_devices
      WHERE vendor='tencent_iotvideo_industry' AND vendor_device_serial='foreign-parent-only'
        AND tenant_id <> '00000000-0000-4000-8000-000000000001' AND deleted_at IS NULL
      LIMIT 1;
      ROLLBACK;`));
    expect(JSON.stringify(ownershipPlan)).toContain("tenant_devices_vendor_device_channel_unique");
    expect(ownershipPlan[0].Plan["Actual Rows"]).toBe(1);

    // Hold the winning transaction open. The loser must wait on the global device lock.
    const winner = session("binding-winner", "BEGIN; SELECT test_bind('concurrent-device');");
    await waitFor("application_name='binding-winner' AND state='idle in transaction'");
    const loser = session("binding-loser", "SELECT test_bind('concurrent-device','102');");
    loser.stdin.end();
    await waitFor("application_name='binding-loser' AND wait_event='advisory'");
    winner.stdin.write("COMMIT;\n");
    winner.stdin.end();
    expect(await winner.exited).toBe(0);
    expect(await loser.exited).not.toBe(0);
    expect(await new Response(loser.stderr).text()).toContain("已绑定");
    expect(check("SELECT count(*) FROM project_cameras WHERE vendor_device_serial='concurrent-device' AND deleted_at IS NULL;")).toBe("1");
    expect(check("SELECT count(*) FROM tenant_devices d JOIN project_cameras c ON c.id=d.bound_camera_id WHERE d.vendor_device_serial='concurrent-device' AND d.bound_project_id=c.project_id;")).toBe("1");

    // Status changes commit while bind waits: transaction must observe the new status.
    for (const status of ["acceptance", "invalid"]) {
      const statusWriter = session("binding-status", `BEGIN; UPDATE projects SET status='${status}' WHERE id='00000000-0000-4000-8000-000000000101';`);
      await waitFor("application_name='binding-status' AND state='idle in transaction'");
      const binder = session("binding-status-racer", `SELECT test_bind('race-${status}');`);
      binder.stdin.end();
      await waitFor("application_name='binding-status-racer' AND wait_event_type='Lock'");
      statusWriter.stdin.write("COMMIT;\n");
      statusWriter.stdin.end();
      expect(await statusWriter.exited).toBe(0);
      expect(await binder.exited).not.toBe(0);
      expect(await new Response(binder.stderr).text()).toContain("不能新增摄像头");
      expect(check(`SELECT count(*) FROM project_cameras WHERE vendor_device_serial='race-${status}';`)).toBe("0");
      check("UPDATE projects SET status='constructing' WHERE id='00000000-0000-4000-8000-000000000101';");
    }

    // Unbind and rebind serialize at the same boundary, with no stale asset release.
    const unbinder = session("binding-unbinder", `BEGIN; SELECT unbind_project_camera('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',id,NULL) FROM project_cameras WHERE vendor_device_serial='concurrent-device' AND deleted_at IS NULL;`);
    await waitFor("application_name='binding-unbinder' AND state='idle in transaction'");
    const rebinder = session("binding-rebinder", "SELECT test_bind('concurrent-device','102');");
    rebinder.stdin.end();
    await waitFor("application_name='binding-rebinder' AND wait_event='advisory'");
    unbinder.stdin.write("COMMIT;\n");
    unbinder.stdin.end();
    expect(await unbinder.exited).toBe(0);
    expect(await rebinder.exited, await new Response(rebinder.stderr).text()).toBe(0);
    expect(check("SELECT count(*) FROM tenant_devices d JOIN project_cameras c ON c.id=d.bound_camera_id WHERE d.vendor_device_serial='concurrent-device' AND c.deleted_at IS NULL AND d.bound_project_id=c.project_id AND c.project_id='00000000-0000-4000-8000-000000000102';")).toBe("1");
    // Exercise the agreed lock with the actual single-device sync RPC as well.
    check(read("20261014092000_tenant_device_channel_page.sql"));
    check("INSERT INTO employees VALUES ('00000000-0000-4000-8000-000000000301');");
    const assetId = check("SELECT id FROM tenant_devices WHERE vendor_device_serial='concurrent-device';");
    const syncSql = `SELECT sync_tenant_device_channel_page('00000000-0000-4000-8000-000000000001','${assetId}',
      '00000000-0000-4000-8000-000000000301','[{"channel_id":"channel","status":"online"}]',now());`;
    const syncer = session("binding-sync", `BEGIN; ${syncSql}`);
    await waitFor("application_name='binding-sync' AND state='idle in transaction'");
    const afterSync = session("binding-after-sync", `SELECT unbind_project_camera('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102',id,NULL)
      FROM project_cameras WHERE vendor_device_serial='concurrent-device' AND deleted_at IS NULL;`);
    afterSync.stdin.end();
    await waitFor("application_name='binding-after-sync' AND wait_event='advisory'");
    syncer.stdin.write("COMMIT;\n");
    syncer.stdin.end();
    expect(await syncer.exited).toBe(0);
    expect(await afterSync.exited).toBe(0);
    expect(check(`SELECT status='online' AND bound_camera_id IS NULL AND bound_project_id IS NULL FROM tenant_devices WHERE id='${assetId}';`)).toBe("t");
    const beforeSync = session("binding-before-sync", "BEGIN; SELECT test_bind('concurrent-device');");
    await waitFor("application_name='binding-before-sync' AND state='idle in transaction'");
    const lateSync = session("binding-late-sync", syncSql);
    lateSync.stdin.end();
    await waitFor("application_name='binding-late-sync' AND wait_event='advisory'");
    beforeSync.stdin.write("COMMIT;\n");
    beforeSync.stdin.end();
    expect(await beforeSync.exited).toBe(0);
    expect(await lateSync.exited).toBe(0);
    expect(check(`SELECT d.bound_camera_id=c.id AND d.bound_project_id=c.project_id AND d.status='online'
      FROM tenant_devices d JOIN project_cameras c ON c.id=d.bound_camera_id WHERE d.id='${assetId}' AND c.deleted_at IS NULL;`)).toBe("t");

  } finally {
    for (const child of sessions) child.kill();
    const cleanup = docker(["rm", "--force", name]);
    expect(cleanup.status, cleanup.stderr).toBe(0);
  }
}, 60_000);
