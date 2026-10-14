import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sqlTest = process.env.TENCENT_REGISTRATION_SQL_TEST === "1" ? test : test.skip;
const migration = new URL("../../../../../supabase/migrations/20261014090000_tenant_device_registration.sql", import.meta.url);
const tenant = "00000000-0000-4000-8000-000000000001";
const otherTenant = "00000000-0000-4000-8000-000000000002";
function docker(args: string[], input?: string) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

sqlTest("registration SQL fences parallel claims, persists receipts, rolls back failed assets and resumes", async () => {
  const name = `gooes-registration-test-${process.pid}-${Date.now()}`;
  expect(docker(["run", "--rm", "-d", "--network", "none", "--name", name,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine"]).status).toBe(0);
  const command = ["exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
  const sql = (text: string) => {
    const result = docker(command, text);
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const asServiceRole = (text: string) => `SET ROLE service_role; ${text}`;
  const serviceSql = (text: string) => sql(asServiceRole(text));
  const expectConflict = (text: string) => {
    const result = docker(command, asServiceRole(text));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("TENANT_DEVICE_REGISTRATION_CONFLICT");
    expect(result.stdout.trim()).toBe("");
  };
  try {
    // TCP excludes the temporary Unix-socket-only server used during image initialization.
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) { ready = true; break; }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const setup = `
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE tenants(id uuid PRIMARY KEY);
      CREATE TABLE employees(id uuid PRIMARY KEY);
      CREATE TABLE projects(id uuid PRIMARY KEY);
      CREATE TABLE project_cameras(id uuid PRIMARY KEY);
      CREATE TABLE tenant_devices(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants,
        vendor text NOT NULL, hardware_serial text, vendor_device_serial text NOT NULL,
        vendor_device_code text, vendor_device_name text, vendor_channel_id text,
        vendor_channel_code text, vendor_channel_name text, device_type text, source_project_id uuid,
        bound_project_id uuid, bound_camera_id uuid, status text DEFAULT 'unknown', raw_status text,
        metadata jsonb DEFAULT '{}', created_by uuid, updated_by uuid,
        last_synced_at timestamptz, deleted_at timestamptz,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
      );
      CREATE UNIQUE INDEX tenant_devices_vendor_device_channel_unique ON tenant_devices
        (vendor, vendor_device_serial, coalesce(vendor_channel_id,'')) WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX tenant_devices_tenant_vendor_hardware_serial_unique ON tenant_devices
        (tenant_id, vendor, lower(hardware_serial))
        WHERE deleted_at IS NULL AND vendor_channel_id IS NULL AND hardware_serial IS NOT NULL;
      ALTER TABLE tenant_devices ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO service_role;
      GRANT SELECT,INSERT,UPDATE ON tenant_devices TO service_role;
      INSERT INTO tenants VALUES ('${tenant}'), ('${otherTenant}');
    `;
    sql(setup + readFileSync(migration, "utf8"));
    expect(sql("SELECT count(*) FROM pg_class WHERE relname IN ('tenant_devices','tenant_tencent_registrations','tenant_tencent_registration_serials') AND relrowsecurity;")).toBe("3");
    expect(sql("SELECT count(*) FROM pg_proc WHERE proname IN ('claim_tenant_tencent_registration','save_tenant_tencent_registration_cloud','complete_tenant_tencent_registration','rename_tenant_tencent_device_serial') AND NOT prosecdef;")).toBe("4");
    expect(serviceSql("SELECT current_user || ':' || rolsuper::text FROM pg_roles WHERE rolname=current_user;")).toBe("service_role:false");
    const claim = (sn: string, tenantId = tenant) => `SELECT claim_tenant_tencent_registration('${tenantId}', '${sn}', 2, NULL);`;
    // Concurrent independent DB sessions, including case/space variants.
    const runs = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const process = Bun.spawn(["docker", ...command], { stdin: new Blob([asServiceRole(claim(i % 2 ? " sn-a " : "SN-A"))]), stdout: "pipe", stderr: "pipe" });
      const [output, errors, status] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
      expect(status, errors).toBe(0);
      return JSON.parse(output);
    }));
    expect(runs.filter(run => run.can_create)).toHaveLength(1);
    expect(new Set(runs.map(run => run.registration.id)).size).toBe(1);
    const id = runs[0].registration.id;
    expect(JSON.parse(serviceSql(claim("SN-A"))).can_create).toBe(false);
    expect(JSON.parse(serviceSql(claim("SN-A", otherTenant))).can_create).toBe(true);
    const save = `SELECT save_tenant_tencent_registration_cloud('${tenant}', '${id}', 'cloud-a', 'code-a', NULL, 'request-a');`;
    serviceSql(save);
    const complete = `SELECT complete_tenant_tencent_registration('${tenant}', '${id}');`;
    // Fail the actual insert, prove cloud receipt is retained by the earlier transaction.
    sql("ALTER TABLE tenant_devices ADD CONSTRAINT injected_failure CHECK (vendor_device_serial <> 'cloud-a');");
    expect(docker(command, asServiceRole(complete)).status).not.toBe(0);
    expect(sql(`SELECT state FROM tenant_tencent_registrations WHERE id='${id}'`)).toBe("cloud_created");
    expect(sql("SELECT count(*) FROM tenant_devices")).toBe("0");
    sql("ALTER TABLE tenant_devices DROP CONSTRAINT injected_failure;");
    const asset = JSON.parse(serviceSql(complete));
    expect(asset.hardware_serial).toBe("SN-A");
    expect(JSON.parse(serviceSql(complete)).id).toBe(asset.id);
    expect(JSON.parse(serviceSql(claim("SN-A"))).asset.id).toBe(asset.id);
    expect(sql("SELECT count(*) FROM tenant_devices")).toBe("1");
    expect(sql(`SELECT to_jsonb(r)::text FROM tenant_tencent_registrations r WHERE id='${id}'`)).not.toContain("password");
    expectConflict(`SELECT complete_tenant_tencent_registration('${otherTenant}', '${id}');`);
    expectConflict(`SELECT save_tenant_tencent_registration_cloud('${tenant}', '${id}', 'different-cloud', NULL, NULL, NULL);`);
    // Repeated same-result saves do not regress completed state.
    serviceSql(save);
    expect(sql(`SELECT state FROM tenant_tencent_registrations WHERE id='${id}'`)).toBe("completed");
    // Completed receipts must never return a moved/retyped/replaced asset, even to service_role.
    for (const [column, replacement, original] of [
      ["tenant_id", otherTenant, tenant],
      ["vendor", "ezviz", "tencent_iotvideo_industry"],
      ["vendor_device_serial", "replaced-cloud", "cloud-a"],
      ["hardware_serial", "SN-B", "SN-A"],
    ]) {
      sql(`UPDATE tenant_devices SET ${column}='${replacement}' WHERE id='${asset.id}';`);
      expectConflict(claim("SN-A"));
      expectConflict(complete);
      expect(serviceSql(`SELECT state FROM tenant_tencent_registrations WHERE id='${id}';`)).toBe("completed");
      sql(`UPDATE tenant_devices SET ${column}='${original}' WHERE id='${asset.id}';`);
    }
    // Normalization alone is not a rename; completed paths accept equivalent serials.
    sql(`UPDATE tenant_devices SET hardware_serial=' sn-a ' WHERE id='${asset.id}';`);
    expect(JSON.parse(serviceSql(claim("SN-A"))).asset.id).toBe(asset.id);
    expect(JSON.parse(serviceSql(complete)).id).toBe(asset.id);
    sql(`UPDATE tenant_devices SET hardware_serial='SN-A' WHERE id='${asset.id}';`);

    const rename = (serial: string | null) => `SELECT rename_tenant_tencent_device_serial('${tenant}', '${asset.id}', ${serial === null ? "NULL" : "'" + serial + "'"}, NULL);`;
    sql(`INSERT INTO tenant_devices(tenant_id,vendor,hardware_serial,vendor_device_serial,vendor_channel_id)
      VALUES ('${tenant}','tencent_iotvideo_industry','SN-A','cloud-a','channel-a');`);
    // Any failed asset update rolls back the new key/alias and every channel SN together.
    sql("ALTER TABLE tenant_devices ADD CONSTRAINT injected_rename_failure CHECK (hardware_serial <> 'SN-B' OR vendor_channel_id IS NULL);");
    expect(docker(command, asServiceRole(rename("SN-B"))).status).not.toBe(0);
    expect(JSON.parse(serviceSql(claim("SN-A"))).registration.id).toBe(id);
    expect(sql(`SELECT count(*) FROM tenant_tencent_registration_serials WHERE tenant_id='${tenant}' AND hardware_serial='SN-B';`)).toBe("0");
    expect(sql("SELECT count(*) FROM tenant_devices WHERE hardware_serial='SN-A';")).toBe("2");
    sql("ALTER TABLE tenant_devices DROP CONSTRAINT injected_rename_failure;");
    expect(JSON.parse(serviceSql(rename(" sn-b "))).hardware_serial).toBe("SN-B");
    expectConflict(claim("SN-A"));
    const renamed = JSON.parse(serviceSql(claim("SN-B")));
    expect(renamed.can_create).toBe(false);
    expect(renamed.registration.id).toBe(id);
    expect(renamed.asset.id).toBe(asset.id);
    expect(renamed.asset.vendor_device_serial).toBe("cloud-a");
    expect(sql("SELECT count(*) FROM tenant_devices WHERE hardware_serial='SN-B';")).toBe("2");
    expect(sql(`SELECT count(*) FROM tenant_tencent_registrations WHERE tenant_id='${tenant}' AND cloud_device_id='cloud-a';`)).toBe("1");
    // Clearing the SN preserves the old fence; a subsequent rename reuses the receipt.
    serviceSql(rename(null));
    expectConflict(claim("SN-B"));
    serviceSql(rename("SN-A"));
    expectConflict(claim("SN-B"));
    expect(JSON.parse(serviceSql(claim("SN-A"))).registration.id).toBe(id);
    expect(JSON.parse(serviceSql(claim("TAKEN"))).can_create).toBe(true);
    expectConflict(rename("TAKEN"));
    expect(JSON.parse(serviceSql(claim("SN-A"))).asset.hardware_serial).toBe("SN-A");
    // A concurrent claim of the new SN and rename have exactly one winner for that key.
    const raced = await Promise.all([rename("RACE-SN"), claim("RACE-SN")].map(async (statement) => {
      const process = Bun.spawn(["docker", ...command], {
        stdin: new Blob([asServiceRole(`SET statement_timeout='5s'; ${statement}`)]), stdout: "pipe", stderr: "pipe",
      });
      const [output, error, status] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
      return { output, error, status };
    }));
    const [renameResult, claimResult] = raced;
    expect(claimResult!.status, claimResult!.error).toBe(0);
    const raceClaim = JSON.parse(claimResult!.output);
    if (renameResult!.status === 0) {
      expect(raceClaim.can_create).toBe(false);
      expect(raceClaim.registration.id).toBe(id);
      expectConflict(claim("SN-A"));
      serviceSql(rename("SN-A"));
    } else {
      expect(renameResult!.error).toContain("TENANT_DEVICE_REGISTRATION_CONFLICT");
      expect(raceClaim.can_create).toBe(true);
      expect(raceClaim.registration.id).not.toBe(id);
      expect(JSON.parse(serviceSql(claim("SN-A"))).registration.id).toBe(id);
    }
    // A same-SN asset of another tenant/vendor is not adopted by the initial claim.
    sql(`INSERT INTO tenant_devices(tenant_id,vendor,hardware_serial,vendor_device_serial)
      VALUES ('${otherTenant}','tencent_iotvideo_industry','FOREIGN-SN','foreign-cloud'),
        ('${tenant}','ezviz','OTHER-VENDOR-SN','ezviz-cloud');`);
    for (const serial of ["FOREIGN-SN", "OTHER-VENDOR-SN"]) {
      const unrelated = JSON.parse(serviceSql(claim(serial)));
      expect(unrelated.can_create).toBe(true);
      expect(unrelated.asset).toBeNull();
      expect(unrelated.registration.state).toBe("pending");
      expect(unrelated.registration.cloud_device_id).toBeNull();
    }
    // A pre-existing legacy device has no receipt until this atomic rename adopts it.
    const legacyAsset = JSON.parse(sql(`INSERT INTO tenant_devices(tenant_id,vendor,hardware_serial,vendor_device_serial,device_type)
      VALUES ('${tenant}','tencent_iotvideo_industry','LEGACY-OLD','legacy-rename-cloud','NVR') RETURNING to_jsonb(tenant_devices);`));
    const renameLegacy = (sn: string) => `SELECT rename_tenant_tencent_device_serial('${tenant}', '${legacyAsset.id}', '${sn}', NULL);`;
    expect(sql("SELECT count(*) FROM tenant_tencent_registrations WHERE cloud_device_id='legacy-rename-cloud';")).toBe("0");
    // Failed rename rolls back the newly seeded receipt/old-SN alias too.
    expectConflict(renameLegacy("TAKEN"));
    expect(sql("SELECT count(*) FROM tenant_tencent_registrations WHERE cloud_device_id='legacy-rename-cloud';")).toBe("0");
    expect(sql(`SELECT count(*) FROM tenant_tencent_registration_serials WHERE tenant_id='${tenant}' AND hardware_serial='LEGACY-OLD';`)).toBe("0");
    expect(sql(`SELECT hardware_serial FROM tenant_devices WHERE id='${legacyAsset.id}';`)).toBe("LEGACY-OLD");
    serviceSql(renameLegacy("LEGACY-NEW"));
    expectConflict(claim("LEGACY-OLD"));
    const adoptedRename = JSON.parse(serviceSql(claim("LEGACY-NEW")));
    expect(adoptedRename.can_create).toBe(false);
    expect(adoptedRename.asset.id).toBe(legacyAsset.id);
    expect(adoptedRename.asset.vendor_device_serial).toBe("legacy-rename-cloud");
    expect(adoptedRename.registration.device_type).toBe(3);
    expect(sql(`SELECT count(DISTINCT registration_id) FROM tenant_tencent_registration_serials
      WHERE tenant_id='${tenant}' AND hardware_serial IN ('LEGACY-OLD','LEGACY-NEW');`)).toBe("1");
    expect(sql("SELECT count(*) FROM tenant_tencent_registrations WHERE cloud_device_id='legacy-rename-cloud';")).toBe("1");
    // Legacy exact SN adoption, wildcard characters remain literal.
    sql(`INSERT INTO tenant_devices(tenant_id,vendor,hardware_serial,vendor_device_serial,device_type)
      VALUES ('${tenant}','tencent_iotvideo_industry','legacy_%','legacy-cloud','NVR');`);
    const legacy = JSON.parse(serviceSql(claim(" LEGACY_% ")));
    expect(legacy.can_create).toBe(false);
    expect(legacy.asset.vendor_device_serial).toBe("legacy-cloud");
    expect(legacy.registration.device_type).toBe(3);
    expect(JSON.parse(serviceSql(claim("LEGACY_XX"))).can_create).toBe(true);
    sql(`UPDATE tenant_devices SET deleted_at=now() WHERE id='${asset.id}';`);
    expectConflict(claim("SN-A"));
    expect(sql(`SELECT count(*) FROM tenant_tencent_registrations WHERE id='${id}'`)).toBe("1");
    // Public roles cannot claim or read receipts. Service-role path is usable.
    expect(docker(command, `SET ROLE authenticated; ${claim("FORBIDDEN")}`).status).not.toBe(0);
    expect(docker(command, "SET ROLE anon; SELECT * FROM tenant_tencent_registrations;").status).not.toBe(0);
    expect(JSON.parse(serviceSql(claim("SERVICE"))).can_create).toBe(true);
    // Lookup remains bounded and indexable on a realistic asset pool.
    sql(`INSERT INTO tenant_devices(tenant_id,vendor,hardware_serial,vendor_device_serial)
      SELECT '${tenant}','tencent_iotvideo_industry','SN-'||g,'bulk-'||g FROM generate_series(1,10000) g;
      ANALYZE tenant_devices;`);
    const plan = sql(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM tenant_devices
      WHERE tenant_id='${tenant}' AND vendor='tencent_iotvideo_industry'
      AND upper(btrim(hardware_serial))='SN-9999' AND deleted_at IS NULL LIMIT 2;`);
    expect(plan).toContain("tenant_devices_registration_sn_lookup");
  } finally {
    expect(docker(["rm", "--force", name]).status).toBe(0);
  }
}, 60_000);
