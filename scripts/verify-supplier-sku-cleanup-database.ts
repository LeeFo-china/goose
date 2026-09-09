/** Run from apps/api: bun --env-file=/dev/null ../../scripts/verify-supplier-sku-cleanup-database.ts */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runSupplierSkuCleanupLocalRegression } from "../apps/api/src/scripts/supplier-purchasable-sku-cleanup-local-regression";

const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const sourceContainer = "supabase_db_gooes";
const container = `gooes-sku-cleanup-${randomUUID()}`;
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
function docker(args: string[], input?: string, timeout = 30_000): string {
  return execFileSync("docker", args, {
    input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function sql(input: string): string {
  return docker(["exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres",
    "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], input, 60_000);
}
function sourceSql(query: string): string {
  return docker(["exec", sourceContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", `BEGIN READ ONLY; ${query}; COMMIT;`])
    .split("\n").filter((line) => line !== "BEGIN" && line !== "COMMIT").join("\n");
}
let launched = false;
try {
  docker(["image", "inspect", image]);
  const versions = new Set(sourceSql("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version").split("\n"));
  assert.ok(versions.size > 0 && [...versions].every((version) => /^\d{14}$/.test(version)));
  const baseline = [...versions].sort().at(-1)!;
  const pending = readdirSync(migrationDirectory).filter((name) =>
    /^\d{14}_.+\.sql$/.test(name) && !versions.has(name.slice(0, 14)) &&
    name.slice(0, 14) <= "20260908010000" && /supplier|warehouse|inventory|procurement/.test(name),
  ).sort();
  assert.ok(pending.every((name) => name.slice(0, 14) > baseline));
  const roles = sourceSql("SELECT format('CREATE ROLE %I;', rolname) FROM pg_roles WHERE rolname <> 'postgres' AND rolname NOT LIKE 'pg_%' ORDER BY rolname");
  const schema = docker(["exec", sourceContainer, "pg_dump", "-U", "postgres", "-d", "postgres",
    "--schema-only", "--no-owner", "--no-privileges", "--exclude-schema=pgsodium", "--exclude-schema=pgsodium_masks"]);
  // Only synthetic data and schema enter this container. A random loopback-only
  // port lets the actual host Bun SQL gateway execute against PostgreSQL.
  launched = true;
  docker(["run", "--rm", "--detach", "--pull=never", "--name", container,
    "--publish", "127.0.0.1::5432", "--read-only", "--tmpfs", "/tmp:rw,size=768m,mode=1777",
    "--tmpfs", "/etc/postgresql-custom:rw,size=1m,uid=100,gid=101,mode=0700",
    "--mount", `type=bind,source=${fileURLToPath(new URL("./fixtures/warehouse-stage-b/sku-cleanup-pg-hba.conf", import.meta.url))},target=/sku-cleanup-pg-hba.conf,readonly`,
    "--memory", "1g", "--cpus", "1", "--user", "postgres", "--entrypoint", "/bin/sh", image, "-c",
    "initdb -D /tmp/sku-cleanup-pg -A trust --no-locale >/dev/null && exec postgres -D /tmp/sku-cleanup-pg -k /tmp -h 0.0.0.0 -F -c hba_file=/sku-cleanup-pg-hba.conf -c shared_preload_libraries=pg_net,pg_stat_statements,supabase_vault -c wal_level=logical -c pg_net.database_name=template1"]);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql("SELECT 1"); ready = true; break; } catch { await Bun.sleep(250); }
  }
  assert.ok(ready, "Disposable database did not become ready");
  sql("ALTER ROLE postgres PASSWORD 'isolated-fixture-only'");
  sql(roles);
  sql(schema);
  for (const name of pending) sql(readFileSync(new URL(name, migrationDirectory), "utf8"));
  sql("CREATE TABLE public.supplier_sku_cleanup_isolated_marker (id boolean PRIMARY KEY)");
  const binding = docker(["port", container, "5432/tcp"]);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const port = Number(binding.split(":")[1]);
  console.log(`PASS schema-only local baseline ${baseline}, ${versions.size} history entries, ${pending.length} procurement migrations`);
  // Permission-boundary imports initialize a Supabase client but perform no
  // network reads. Never inherit a real endpoint/key into that import.
  process.env.SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_PUBLISH = "isolated-fixture-only";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-fixture-only";
  await runSupplierSkuCleanupLocalRegression({
    adapter: "postgres", hostname: "127.0.0.1", port, database: "postgres",
    username: "postgres", password: "isolated-fixture-only", tls: false,
    url: `postgresql://postgres:isolated-fixture-only@127.0.0.1:${port}/postgres`,
  });
  const repairFixture = readFileSync(new URL(
    "./fixtures/warehouse-stage-b/reviewed-orphan-repair-full-schema.sql", import.meta.url,
  ), "utf8");
  assert.equal(repairFixture.split("-- __FULL_REPAIR_MIGRATION__").length, 2);
  const repairMigration = readFileSync(new URL(
    "20260908062915_repair_reviewed_orphan_warehouses.sql", migrationDirectory,
  ), "utf8");
  const repairOutput = sql(repairFixture.replace("-- __FULL_REPAIR_MIGRATION__", () => repairMigration));
  assert.match(repairOutput, /PASS full-schema exact migration/);
  console.log(repairOutput);
  console.log("PASS isolated SKU cleanup regression; no real data or remote database modified");
} finally {
  if (launched) {
    const inspection = spawnSync("docker", ["container", "inspect", container], { encoding: "utf8", timeout: 15_000 });
    if (inspection.status === 0) docker(["stop", "--time", "5", container], undefined, 15_000);
    else assert.match(inspection.stderr ?? "", /No such (object|container)/i);
  }
}
