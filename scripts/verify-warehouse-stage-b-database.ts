/** Schema-only local snapshot -> disposable offline PostgreSQL; never writes to source. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const sourceContainer = "supabase_db_gooes";
const container = `gooes-stage-b-database-${randomUUID()}`;
const migrationDirectory = "supabase/migrations";

function docker(args: string[], input?: string, timeout = 30_000): string {
  return execFileSync("docker", args, {
    input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function sql(input: string): string {
  return docker([
    "exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres",
    "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  ], input, 60_000);
}

// Only metadata/schema is read from the existing LOCAL database. No rows,
// passwords, remote URLs, host volumes or ports enter the regression container.
function sourceSql(query: string): string {
  return docker([
    "exec", sourceContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query,
  ]);
}

let launchAttempted = false;
try {
  docker(["image", "inspect", image]);
  const versions = new Set(sourceSql(
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
  ).split("\n"));
  assert.ok(versions.size > 0 && [...versions].every((v) => /^\d{14}$/.test(v)));
  const baseline = [...versions].sort().at(-1)!;
  const pending = readdirSync(migrationDirectory).filter((name) => {
    const version = name.slice(0, 14);
    // This fixture has no tenant data: targeted historical repair migrations
    // intentionally cannot run here. This explicit domain scope is not a
    // substitute for the approved development DB's complete history upgrade.
    return /^\d{14}_.+\.sql$/.test(name) && !versions.has(version) &&
      /supplier|warehouse|inventory|procurement/.test(name);
  }).sort();
  assert.ok(pending.every((name) => name.slice(0, 14) > baseline),
    "Local source migration history has holes; audit before using this baseline");
  const roles = sourceSql(
    "SELECT format('CREATE ROLE %I;', rolname) FROM pg_roles " +
    "WHERE rolname <> 'postgres' AND rolname NOT LIKE 'pg_%' ORDER BY rolname",
  );
  const schema = docker([
    "exec", sourceContainer, "pg_dump", "-U", "postgres", "-d", "postgres",
    "--schema-only", "--no-owner", "--no-privileges", "--exclude-schema=pgsodium",
    "--exclude-schema=pgsodium_masks",
  ]);
  // pg_graphql's extension-generated wrapper is not exported by pg_dump even
  // though its ACL is. Restore application ACLs explicitly instead of inventing
  // that unrelated extension function or ignoring SQL restore failures.
  const functionAcls = sourceSql(`
    SELECT command FROM (
    SELECT 0 AS phase, format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', p.oid::regprocedure) AS command
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
    UNION ALL
    SELECT 1 AS phase, format('GRANT %s ON FUNCTION %s TO %s%s;', a.privilege_type,
      p.oid::regprocedure, CASE WHEN a.grantee = 0 THEN 'PUBLIC'
        ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public' AND p.prokind = 'f'
    ) commands ORDER BY phase, command
  `);
  launchAttempted = true;
  docker([
    "run", "--rm", "--detach", "--network", "none", "--name", container,
    "--user", "postgres", "--entrypoint", "/bin/sh", image, "-c",
    "initdb -D /tmp/stage-b-pg -A trust --no-locale >/dev/null && exec postgres -D /tmp/stage-b-pg -k /tmp -h '' -F -c shared_preload_libraries=pg_net,pg_stat_statements,supabase_vault -c wal_level=logical",
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql("SELECT 1"); ready = true; break; } catch { await Bun.sleep(250); }
  }
  assert.ok(ready, "Isolated database did not become ready");
  sql(roles);
  sql(schema);
  sql(functionAcls);
  console.log(`PASS restored schema-only baseline ${baseline} (${versions.size} migrations)`);
  for (const name of pending) {
    sql(readFileSync(`${migrationDirectory}/${name}`, "utf8"));
    console.log(`PASS isolated migration ${name}`);
  }
  const fixtures = process.argv.slice(2);
  for (const fixture of fixtures) {
    assert.match(fixture, /^scripts\/fixtures\/warehouse-stage-b\/[a-z0-9-]+\.sql$/,
      "Only scoped Stage B SQL fixtures are accepted");
    sql(readFileSync(fixture, "utf8"));
    console.log(`PASS ${fixture}`);
  }
  console.log("Procurement-domain schema replay passed; NOT full migration history/data or API acceptance.");
} finally {
  if (launchAttempted) {
    const inspection = spawnSync("docker", ["container", "inspect", container], {
      encoding: "utf8", timeout: 15_000,
    });
    if (inspection.status === 0) {
      docker(["stop", "--time", "5", container], undefined, 15_000);
    } else {
      assert.match(inspection.stderr ?? "", /No such (object|container)/i,
        `Unable to verify cleanup of ${container}`);
    }
  }
}
