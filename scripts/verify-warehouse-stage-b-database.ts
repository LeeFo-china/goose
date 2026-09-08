/** Schema-only local snapshot -> disposable offline PostgreSQL; never writes to source. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertInventoryScanBound, parseInventoryPlanNotices } from "./warehouse-inventory-plan-notices";
import { MATERIAL_TYPE_SECTIONS, syncSelectedDatabaseTypes } from "./warehouse-material-type-sync";
import { runWarehouseMaterialHttpSmoke } from "./warehouse-material-http-smoke";

const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const sourceContainer = "supabase_db_gooes";
const container = `gooes-stage-b-database-${randomUUID()}`;
const migrationDirectory = "supabase/migrations";
const generateMaterialTypes = process.argv.includes("--generate-material-types");
const materialApiSmoke = process.argv.includes("--material-api-smoke");

function docker(args: string[], input?: string, timeout = 30_000): string {
  return execFileSync("docker", args, {
    input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function sql(input: string, captureInventoryPlans = false): string {
  const args = [
    "exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres",
    "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  ];
  if (!captureInventoryPlans) return docker(args, input, 60_000);
  const result = spawnSync("docker", args, {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, "Isolated inventory plan capture failed");
  assert.equal(result.status, 0, result.stderr);
  const cases = ["auto-1", "auto-2", "auto-3", "auto-4", "auto-5", "auto-6", "auto-7",
    "custom-sku", "custom-warehouse-sku", "generic-sku", "generic-warehouse-sku"];
  const plans = parseInventoryPlanNotices(result.stderr, cases);
  for (const entry of plans) console.log(`RPC_PLAN ${JSON.stringify(entry)}`);
  // Synthetic SKU has exactly 100 facts across ten warehouses. Count, page and
  // bounded display must not scan the other 99,903 tenant facts for this filter.
  for (const entry of plans.slice(5)) assertInventoryScanBound(entry, 100);
  return result.stdout;
}

// Only metadata/schema is read from the existing LOCAL database. No rows,
// passwords, remote URLs, host volumes or ports enter the regression container.
function sourceSql(query: string): string {
  return docker([
    "exec", sourceContainer, "psql", "-U", "postgres", "-d", "postgres",
    "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query,
  ]);
}

function verifyWarehouseRolloutMigrationRollback(migration: string): void {
  const snapshotQuery = `SELECT jsonb_build_object(
    'functions', (SELECT jsonb_agg(jsonb_build_object(
      'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'acl',p.proacl::text,'owner',p.proowner,'config',p.proconfig) ORDER BY p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN
        ('set_tenant_supplier_rollout_settings','__gooes_set_supplier_rollout_settings_v2')),
    'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.tenant_id) FROM public.tenant_supplier_settings s),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.supplier_command_events e),
    'migration_history',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version) FROM supabase_migrations.schema_migrations m)
  )`;
  const assertNoLeakedFunctions = `DO $$ BEGIN
    IF to_regprocedure('public.__gooes_set_supplier_rollout_settings_v2(jsonb,uuid,text)') IS NOT NULL
      OR to_regprocedure('public.set_tenant_supplier_rollout_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,uuid,uuid,text,text)') IS NOT NULL
    THEN RAISE EXCEPTION 'warehouse migration leaked a function across rollback'; END IF;
  END $$;`;
  sql(assertNoLeakedFunctions);
  const before = JSON.parse(sql(snapshotQuery));
  assert.equal((migration.match(/^COMMIT;\s*$/gm) ?? []).length, 1,
    "Warehouse migration must contain one final COMMIT for failure injection");
  assert.match(migration, /COMMIT;\s*$/);
  const failureMarker = "STAGE_B_ROLLOUT_MIGRATION_INJECTED_FAILURE";
  const failingMigration = migration.replace(/^COMMIT;\s*$/m,
    () => `DO $$ BEGIN RAISE EXCEPTION '${failureMarker}'; END $$;\nCOMMIT;`);
  // This is the only expected-error path. ON_ERROR_STOP terminates the session
  // before COMMIT, so disconnect rolls back all DDL and ACL changes together.
  const failure = spawnSync("docker", ["exec", "-i", container, "psql",
    "-h", "/tmp", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: failingMigration, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(failure.error, undefined, "Warehouse migration failure probe could not execute");
  assert.equal(failure.status, 3, "Injected migration failure must stop psql before COMMIT");
  assert.match(failure.stderr, new RegExp(`ERROR:  ${failureMarker}`));
  sql(assertNoLeakedFunctions);
  assert.deepEqual(JSON.parse(sql(snapshotQuery)), before,
    "Failed warehouse migration changed definitions, ACLs, settings, events or migration history");
  sql("CREATE TABLE public.stage_b_rollout_migration_rollback_evidence (verified boolean NOT NULL CHECK (verified)); " +
    "INSERT INTO public.stage_b_rollout_migration_rollback_evidence VALUES (true)");
  console.log("PASS injected warehouse migration failure rolled back definitions/ACLs/config/history; no new overload/core leaked");
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
    "initdb -D /tmp/stage-b-pg -A trust --no-locale >/dev/null && exec postgres -D /tmp/stage-b-pg -k /tmp -h 127.0.0.1 -F -c shared_preload_libraries=pg_net,pg_stat_statements,supabase_vault -c wal_level=logical",
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
  const fixtures = process.argv.slice(2).filter((arg) => !["--generate-material-types", "--material-api-smoke"].includes(arg));
  for (const name of pending) {
    if (name === "20260908015230_create_warehouse_project_material_commands.sql" &&
      fixtures.includes("scripts/fixtures/warehouse-stage-b/material-rollout.sql")) {
      sql(readFileSync("scripts/fixtures/warehouse-stage-b/material-rollout-before.sql", "utf8"));
      console.log("PASS genuine pre-C synthetic rollout receipt saved before material schema migration");
    }
    if (name === "20260908010000_extend_warehouse_procurement_rollout_command.sql" &&
      fixtures.includes("scripts/fixtures/warehouse-stage-b/rollout-command.sql")) {
      sql(readFileSync("scripts/fixtures/warehouse-stage-b/rollout-command-before.sql", "utf8"));
      console.log("PASS synthetic historical rollout commands created before migration");
      verifyWarehouseRolloutMigrationRollback(readFileSync(`${migrationDirectory}/${name}`, "utf8"));
    }
    sql(readFileSync(`${migrationDirectory}/${name}`, "utf8"));
    console.log(`PASS isolated migration ${name}`);
  }
  for (const fixture of fixtures) {
    assert.match(fixture, /^scripts\/fixtures\/warehouse-stage-b\/[a-z0-9-]+\.sql$/,
      "Only scoped Stage B SQL fixtures are accepted");
    const output = sql(readFileSync(fixture, "utf8"),
      fixture === "scripts/fixtures/warehouse-stage-b/inventory-read-performance.sql");
    // Fixtures contain only synthetic data. Explicit evidence rows retain query
    // plans; ordinary psql result rows stay quiet, as before.
    for (const line of output.split("\n")) {
      if (line.startsWith("EVIDENCE ") || line.startsWith("RPC_META ")) console.log(line);
    }
    console.log(`PASS ${fixture}`);
  }
  if (materialApiSmoke) {
    // Historical projects legitimately allow a null name. Exercise the real SQL
    // -> strict repository -> HTTP fallback using only our synthetic project.
    sql("UPDATE public.projects SET name=NULL WHERE id=(SELECT project_id FROM public.stage_c_material_fixture)");
    const snapshotQuery = `SELECT jsonb_build_object(
      'quantity',b.quantity_on_hand::text,'value',b.inventory_value::text,
      'net_cost',(SELECT sum(CASE event_direction WHEN 'decrease' THEN -amount ELSE amount END)::text
        FROM public.project_cost_events WHERE tenant_id=f.tenant_id),
      'payables',(SELECT count(*) FROM public.supplier_payable_events WHERE tenant_id=f.tenant_id),
      'transactions',(SELECT count(*) FROM public.inventory_transactions WHERE tenant_id=f.tenant_id),
      'cost_events',(SELECT count(*) FROM public.project_cost_events WHERE tenant_id=f.tenant_id),
      'commands',(SELECT count(*) FROM public.warehouse_material_command_events WHERE tenant_id=f.tenant_id))
      FROM public.stage_c_material_fixture f JOIN public.inventory_balances b ON b.tenant_id=f.tenant_id
        AND b.warehouse_id=f.warehouse_id AND b.supplier_sku_id=f.sku_id`;
    const before = JSON.parse(sql(snapshotQuery));
    await runWarehouseMaterialHttpSmoke(container, sql("SELECT row_to_json(f) FROM public.stage_c_material_fixture f"));
    assert.deepEqual(JSON.parse(sql(snapshotQuery)), { ...before, transactions: before.transactions + 3,
      cost_events: before.cost_events + 3, commands: before.commands + 7 },
    "Real HTTP issue/return must reconcile stock/net costs, add only exact facts and leave supplier payables unchanged");
    console.log("PASS HTTP-driven SQL reconciliation: stock/net cost restored, exactly 3 inventory/cost facts and 7 commands, no payable added");
  }
  if (generateMaterialTypes) {
    // Shares only the disposable container's offline loopback. No host network,
    // port, credentials or production data; options verified against this image.
    const generated = docker(["run", "--rm", "--network", `container:${container}`,
      "--env", "PG_META_DB_HOST=127.0.0.1", "--env", "PG_META_GENERATE_TYPES=typescript",
      "--env", "PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public",
      "--env", "PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true",
      "public.ecr.aws/supabase/postgres-meta:v0.96.4"], undefined, 60_000);
    const target = "apps/api/src/types/database.ts";
    writeFileSync(target, syncSelectedDatabaseTypes(readFileSync(target, "utf8"), generated, MATERIAL_TYPE_SECTIONS));
    console.log("PASS generated and synced only Stage C database type entries from isolated real schema");
  }
  console.log("Procurement-domain isolated verification passed; NOT full migration history/data, real-environment or end-to-end login acceptance.");
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
