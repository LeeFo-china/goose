/** Isolated PostgreSQL regression: no business DB, ports, volumes or migrations. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const image = "public.ecr.aws/supabase/postgres:17.6.1.106";
const container = `gooes-inventory-regression-${randomUUID()}`;
const migrationPath = "supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql";
const baseline = process.argv.includes("--baseline");
const source = baseline
  ? execFileSync("git", ["show", `77ec1616:${migrationPath}`], { encoding: "utf8" })
  : readFileSync(migrationPath, "utf8");
const tenant = "10000000-0000-4000-8000-000000000001";
const warehouse = "20000000-0000-4000-8000-000000000001";
const order = "30000000-0000-4000-8000-000000000001";
const item = "40000000-0000-4000-8000-000000000001";
const sku = "50000000-0000-4000-8000-000000000001";
const receipt1 = "60000000-0000-4000-8000-000000000001";
const receipt2 = "60000000-0000-4000-8000-000000000002";
const actor = "70000000-0000-4000-8000-000000000001";

function sql(input: string): string {
  return execFileSync("docker", [
    "exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres",
    "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  ], { input, encoding: "utf8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `SQL fragment missing: ${start}`);
  return source.slice(from, to);
}

function verifyBackfill(): void {
  const ddl = between(
    "ALTER TABLE public.supplier_payable_events\nADD COLUMN",
    "ALTER FUNCTION public.create_supplier_purchase_order_receipt(",
  );
  const fixtures = ["supplier_payable_events", "supplier_payment_requests", "supplier_payments"]
    .map((table) => `
      CREATE TABLE public.${table} (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
        tenant_supplier_id uuid, due_at timestamptz, updated_at timestamptz,
        paid_at timestamptz
      );
      INSERT INTO public.${table}(id, tenant_id, project_id)
      VALUES ('${item}', '${tenant}', '${order}');
      CREATE TRIGGER existing_guard BEFORE UPDATE OR DELETE ON public.${table}
      FOR EACH ROW EXECUTE FUNCTION public.audit_reject_update();
    `).join("\n");
  const verification = ["supplier_payable_events", "supplier_payment_requests", "supplier_payments"]
    .map((table) => `
      IF (SELECT destination_type FROM public.${table} WHERE id = '${item}') <> 'project'
        THEN RAISE EXCEPTION 'Historical row not preserved: ${table}'; END IF;
      INSERT INTO public.${table}(id, tenant_id, project_id)
      VALUES ('${receipt1}', '${tenant}', '${order}');
      IF (SELECT destination_type FROM public.${table} WHERE id = '${receipt1}') <> 'project'
        THEN RAISE EXCEPTION 'Default missing: ${table}'; END IF;
      INSERT INTO public.${table}(id, tenant_id, project_id, destination_type, warehouse_id)
      VALUES ('${receipt2}', '${tenant}', NULL, 'warehouse', '${warehouse}');
      BEGIN
        UPDATE public.${table} SET destination_type = 'project';
        RAISE EXCEPTION 'Guard was bypassed';
      EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
      END;
      BEGIN
        INSERT INTO public.${table}(id, tenant_id, project_id, destination_type, warehouse_id)
        VALUES ('${actor}', '${tenant}', '${order}', 'warehouse', '${warehouse}');
        RAISE EXCEPTION 'Mixed destination accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
    `).join("\n");
  sql(`BEGIN;
    CREATE TABLE public.warehouses(id uuid, tenant_id uuid, UNIQUE(id,tenant_id));
    INSERT INTO public.warehouses VALUES ('${warehouse}','${tenant}');
    CREATE FUNCTION public.audit_reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='P9001', MESSAGE='Immutable fixture'; END;
    $$;
    ${fixtures}
    ${ddl}
    DO $$ BEGIN ${verification} END $$;
    ROLLBACK;`);
}

function verifyAmounts(quantity = 10, total = 100, firstQuantity = 4): void {
  const firstAmount = Math.round(total * firstQuantity / quantity * 100) / 100;
  const average = Math.round(total / quantity * 10_000) / 10_000;
  const from = source.indexOf("WITH previous AS MATERIALIZED", source.indexOf("ELSIF v_order.destination_type = 'warehouse'"));
  const endMarker = "updated_at = now();";
  const to = source.indexOf(endMarker, from);
  assert.ok(from >= 0 && to > from, "Warehouse posting SQL fragment missing");
  const posting = source.slice(from, to + endMarker.length);
  sql(`BEGIN;
    CREATE TABLE public.inventory_transactions (
      tenant_id uuid, warehouse_id uuid, supplier_sku_id uuid, transaction_type text,
      quantity_delta numeric(18,4), unit_cost numeric(18,4), value_delta numeric(18,2),
      source_type text, source_id uuid, project_id uuid, cost_category_id uuid,
      occurred_at timestamptz, created_by_employee_id uuid,
      UNIQUE(tenant_id,source_type,source_id)
    );
    CREATE TABLE public.inventory_balances (
      tenant_id uuid, warehouse_id uuid, supplier_sku_id uuid,
      quantity_on_hand numeric(18,4), inventory_value numeric(18,2),
      average_unit_cost numeric(18,4), version integer DEFAULT 1, updated_at timestamptz,
      UNIQUE(tenant_id,warehouse_id,supplier_sku_id)
    );
    CREATE TABLE public.supplier_purchase_order_receipt_items (
      id uuid, receipt_id uuid, tenant_id uuid, supplier_purchase_order_id uuid,
      supplier_purchase_order_item_id uuid, accepted_quantity numeric(18,4)
    );
    CREATE TABLE public.supplier_purchase_order_items (
      id uuid, tenant_id uuid, supplier_purchase_order_id uuid,
      quantity numeric(18,4), total_amount numeric(18,2), supplier_sku_id uuid,
      cost_category_id uuid
    );
    CREATE TABLE public.supplier_purchase_order_item_fulfillments (
      supplier_purchase_order_item_id uuid, tenant_id uuid,
      supplier_purchase_order_id uuid, accepted_quantity numeric(18,4)
    );
    CREATE FUNCTION public.audit_post(p_receipt_id uuid) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE
        p_tenant_id uuid := '${tenant}'; p_order_id uuid := '${order}';
        p_received_at timestamptz := '2026-09-07T00:00:00Z';
        p_actor_employee_id uuid := '${actor}'; v_order record;
      BEGIN
        SELECT '${warehouse}'::uuid AS warehouse_id INTO v_order;
        ${posting}
      END;
    $$;
    INSERT INTO public.supplier_purchase_order_items
      VALUES ('${item}','${tenant}','${order}',${quantity},${total},'${sku}','${actor}');
    INSERT INTO public.supplier_purchase_order_item_fulfillments
      VALUES ('${item}','${tenant}','${order}',${firstQuantity});
    INSERT INTO public.supplier_purchase_order_receipt_items
      VALUES ('${receipt1}','${receipt1}','${tenant}','${order}','${item}',${firstQuantity});
    SELECT public.audit_post('${receipt1}');
    DO $$ BEGIN
      IF (SELECT inventory_value FROM public.inventory_balances) <> ${firstAmount} THEN
        RAISE EXCEPTION 'First receipt amount mismatch'; END IF;
    END $$;
    UPDATE public.supplier_purchase_order_item_fulfillments SET accepted_quantity=${quantity};
    INSERT INTO public.supplier_purchase_order_receipt_items
      VALUES ('${receipt2}','${receipt2}','${tenant}','${order}','${item}',${quantity - firstQuantity});
    SELECT public.audit_post('${receipt2}');
    DO $$ BEGIN
      IF (SELECT value_delta FROM public.inventory_transactions WHERE source_id='${receipt2}') <> ${total} - ${firstAmount}
        OR (SELECT inventory_value FROM public.inventory_balances) <> ${total}
        OR (SELECT quantity_on_hand FROM public.inventory_balances) <> ${quantity}
        OR (SELECT average_unit_cost FROM public.inventory_balances) <> ${average} THEN
        RAISE EXCEPTION 'Split receipts must subtract previous amounts'; END IF;
      BEGIN
        PERFORM public.audit_post('${receipt2}');
        RAISE EXCEPTION 'Duplicate source accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      IF (SELECT inventory_value FROM public.inventory_balances) <> ${total} THEN
        RAISE EXCEPTION 'Duplicate source changed balance'; END IF;
    END $$;
    ROLLBACK;`);
}

function verifyInternalPermissions(): void {
  const signature = "uuid,uuid,uuid,integer,text,timestamptz,text,jsonb,uuid,uuid,text";
  const acl = between(
    "ALTER FUNCTION public.create_supplier_purchase_order_receipt(",
    "CREATE OR REPLACE FUNCTION public.create_supplier_purchase_order_receipt(",
  );
  sql(`BEGIN;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION public.create_supplier_purchase_order_receipt(${signature})
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    REVOKE ALL ON FUNCTION public.create_supplier_purchase_order_receipt(${signature}) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order_receipt(${signature}) TO service_role;
    ${acl}
    DO $$ DECLARE role_name text; BEGIN
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_function_privilege(role_name,
          'public.create_supplier_purchase_order_receipt_fulfillment_v2(${signature})', 'EXECUTE') THEN
          RAISE EXCEPTION 'Internal function callable by %', role_name;
        END IF;
      END LOOP;
    END $$;
    ROLLBACK;`);
}

let launchAttempted = false;
let failures = 0;
const checks = [
  ["historical destination backfill preserves guards", verifyBackfill],
  ["split receipt value and duplicate-source rollback", () => verifyAmounts()],
  ["split receipt rounding remainder", () => verifyAmounts(3, 100, 1)],
  ["fractional quantity split receipt", () => verifyAmounts(1.25, 7.01, 0.5)],
  ["internal receipt function ACL", verifyInternalPermissions],
] as const;
try {
  // Reuse the existing image; never pull dependencies implicitly.
  execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
  launchAttempted = true;
  execFileSync("docker", [
    "run", "--rm", "--detach", "--network", "none", "--name", container,
    "--user", "postgres", "--entrypoint", "/bin/sh", image, "-c",
    "initdb -D /tmp/inventory-test-pg -A trust --no-locale >/dev/null && exec postgres -D /tmp/inventory-test-pg -k /tmp -h '' -F",
  ], { stdio: "pipe", timeout: 30_000 });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql("SELECT 1;"); ready = true; break; } catch { await Bun.sleep(250); }
  }
  assert.ok(ready, "Isolated PostgreSQL did not become ready");
  for (const [name, verify] of checks) {
    try { verify(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}`, String(error)); }
  }
} finally {
  if (launchAttempted) {
    // The daemon may have created the container even when docker run times out.
    const inspection = spawnSync("docker", ["container", "inspect", container], {
      encoding: "utf8", timeout: 15_000,
    });
    if (inspection.status === 0) {
      execFileSync("docker", ["stop", "--time", "5", container], {
        stdio: "ignore", timeout: 15_000,
      });
    } else {
      assert.match(inspection.stderr ?? "", /No such (object|container)/i,
        `Unable to verify cleanup of ${container}`);
    }
  }
}
console.log(`${baseline ? "baseline" : "working tree"}: ${checks.length - failures} passed, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
