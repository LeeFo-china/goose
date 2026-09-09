import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// No application connection or data mount: real warehouse/audit DDL with minimal
// synthetic parents and the nine reviewed inbound FK shapes, in a disposable DB.
const foundation = readFileSync(new URL("../supabase/migrations/20260905210000_create_warehouse_foundation.sql", import.meta.url), "utf8");
const audit = readFileSync(new URL("../supabase/migrations/20260510120000_create_platform_audit_logs.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260908062915_repair_reviewed_orphan_warehouses.sql", import.meta.url), "utf8");
const fixture = readFileSync(new URL("./fixtures/warehouse-stage-b/reviewed-orphan-repair.sql", import.meta.url), "utf8");
const warehouseDdl = foundation.match(/CREATE SEQUENCE public\.warehouse_code_seq[\s\S]+?(?=CREATE TABLE public\.warehouse_command_events)/)?.[0];
const auditDdl = audit.match(/CREATE TABLE IF NOT EXISTS public\.platform_audit_logs[\s\S]+?\n\);/)?.[0];
assert.ok(warehouseDdl && auditDdl, "Expected real migration DDL blocks");
const body = migration.match(/DO \$repair\$\n([\s\S]+?)\n\$repair\$;/)?.[1];
assert.ok(migration.trim() === "" || body, "Expected a single repair DO block");
const relations = [
  "inventory_balances", "inventory_transactions", "supplier_payable_events",
  "supplier_payment_requests", "supplier_payments", "supplier_purchase_batches",
  "supplier_purchase_orders", "supplier_purchase_requisitions", "warehouse_command_events",
];
const setup = `SET client_min_messages=warning;
SET timezone='UTC';
CREATE TABLE public.tenants(id uuid PRIMARY KEY);
CREATE TABLE public.employees(id uuid PRIMARY KEY,tenant_id uuid REFERENCES public.tenants(id),UNIQUE(id,tenant_id));
${warehouseDdl}
${auditDdl}
ALTER TABLE public.platform_audit_logs ADD COLUMN request_id text, ADD COLUMN idempotency_key uuid;
${relations.map((table) => `CREATE TABLE public.${table}(
  warehouse_id uuid,tenant_id uuid,CONSTRAINT ${table}_warehouse_tenant_fkey
  FOREIGN KEY(warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id) ON DELETE RESTRICT);`).join("\n")}`;
const sql = `${setup}
${fixture.replace("-- __REVIEWED_REPAIR_BODY__", body ?? "BEGIN RETURN; END;")}
-- Execute the exact full migration too, including its transaction and settings.
SET timezone='Asia/Shanghai';
${migration}
DO $$ BEGIN
  IF (SELECT count(*) FROM public.warehouses)<>1
    OR (SELECT count(*) FROM public.platform_audit_logs)<>4 THEN
    RAISE EXCEPTION 'FULL_MIGRATION_RESULT_MISMATCH';
  END IF;
  ALTER TABLE public.warehouses ADD CONSTRAINT restored_tenant_probe
    FOREIGN KEY(tenant_id) REFERENCES public.tenants(id);
  ALTER TABLE public.warehouses ADD CONSTRAINT restored_employee_probe
    FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id);
END $$;
SELECT 'FULL_MIGRATION_AND_RESTORED_FKS_PASSED' AS result;`;
const result = spawnSync("docker", [
  "run", "--rm", "--interactive", "--pull=never",
  "--name", "gooes-orphan-repair-local", "--label", "gooes.task=reviewed-orphan-repair",
  "--network", "none", "--read-only", "--memory", "512m", "--cpus", "1",
  "--user", "100:101", "--tmpfs", "/tmp:rw,nosuid,size=256m,uid=100,gid=101",
  "--entrypoint", "/bin/bash", "public.ecr.aws/supabase/postgres:17.6.1.106",
  "-ceu", `
export PGHOST=/tmp PGUSER=postgres
initdb -D /tmp/orphan-pg -U postgres --auth=trust --no-locale >/dev/null
pg_ctl -D /tmp/orphan-pg -l /tmp/orphan-pg.log -o "-k /tmp -c listen_addresses='' -c shared_preload_libraries=''" -w start >/dev/null
trap 'pg_ctl -D /tmp/orphan-pg -m immediate -w stop >/dev/null' EXIT
createdb orphan_repair_test
psql -X -q -v ON_ERROR_STOP=1 -d orphan_repair_test
`,
], { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exitCode = result.status ?? 1;
