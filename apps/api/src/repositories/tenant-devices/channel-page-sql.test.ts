import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const sqlTest = process.env.CAMERA_ONBOARDING_SQL_TEST === "1" ? test : test.skip;
function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}
sqlTest("single-device sync preserves ownership and SN with all-or-nothing page writes", async () => {
  const name = `camera-channel-page-${process.pid}-${Date.now()}`;
  expect(docker(["run", "--rm", "-d", "--network", "none", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine"]).status).toBe(0);
  try {
    let ready = false;
    for (let i=0; i<100; i++) {
      if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) { ready=true; break; }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const root = new URL("../../../../../supabase/migrations/", import.meta.url);
    const base = readFileSync(new URL("20260512120000_create_tenant_devices.sql", root), "utf8").split("DROP TRIGGER")[0];
    const serial = readFileSync(new URL("20260925090000_add_tenant_device_hardware_serial.sql", root), "utf8");
    const migration = readFileSync(new URL("20261014092000_tenant_device_channel_page.sql", root), "utf8");
    const assertions = readFileSync(new URL("./channel-page-fixture.sql", import.meta.url), "utf8");
    const sql = `BEGIN;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE tenants(id uuid PRIMARY KEY); CREATE TABLE employees(id uuid PRIMARY KEY);
      CREATE TABLE projects(id uuid PRIMARY KEY); CREATE TABLE project_cameras(id uuid PRIMARY KEY);
      ${base} ${serial} ${migration} ${assertions} ROLLBACK;`;
    const run = docker(["exec", "-i", name, "psql", "-h", "127.0.0.1", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], sql);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("channel-page assertions passed");
    expect(run.stdout).toContain("tenant_devices_channel_page_idx");
  } finally { expect(docker(["rm", "-f", name]).status).toBe(0); }
}, 60_000);
