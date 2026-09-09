import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { resolveLocalSupabasePostgres } from "./supplier-rollout-settings-database.test-helper";

const migrations = new URL("../../../../supabase/migrations/", import.meta.url);
const functionPattern = /CREATE(?: OR REPLACE)? FUNCTION public\.get_supplier_purchase_order_financial_summary\([\s\S]*?\n\$\$;/g;
const definitions = readdirSync(migrations).sort().flatMap((name) =>
  name.endsWith(".sql")
    ? [...readFileSync(new URL(name, migrations), "utf8").matchAll(functionPattern)].map((match) => match[0])
    : [],
);
const latestDefinition = definitions.at(-1) ?? "";
const fixMigration = readFileSync(new URL(
  "20260908161657_fix_purchase_order_accepted_financial_summary.sql", migrations,
), "utf8");
const postgres = resolveLocalSupabasePostgres();
const database = `summary_test_${randomUUID().replaceAll("-", "")}`;
let created = false;

function docker(args: string[], input?: string): string {
  expect(postgres.available, "Start the local Supabase database before this test").toBe(true);
  if (!postgres.available) return "";
  const result = spawnSync("docker", ["exec", "-i", postgres.container, ...args], {
    input, encoding: "utf8", timeout: 15_000,
  });
  expect(result.status, result.error?.message ?? result.stderr).toBe(0);
  return result.stdout;
}

function sql(input: string): string {
  return docker(["psql", "-X", "-U", "postgres", "-d", database, "-Atq", "-v", "ON_ERROR_STOP=1"], input).trim();
}

const tenant = "91000000-0000-4000-8000-000000000001";
const otherTenant = "91000000-0000-4000-8000-000000000002";
const warehouseOrder = "92000000-0000-4000-8000-000000000001";
const projectOrder = "92000000-0000-4000-8000-000000000002";
const rejectedOrder = "92000000-0000-4000-8000-000000000003";
const foreignOrder = "92000000-0000-4000-8000-000000000004";
const missingOrder = "92000000-0000-4000-8000-000000000005";

beforeAll(() => {
  // Isolated, reduced-schema SQL test: no writes to the local application DB or DEV.
  // Columns mirror the real tables; receipt posting itself is tested separately.
  docker(["createdb", "-U", "postgres", database]);
  created = true;
  sql(`
    CREATE TABLE public.supplier_purchase_order_fulfillments (
      tenant_id uuid NOT NULL, supplier_purchase_order_id uuid UNIQUE NOT NULL,
      accepted_total_amount numeric(18,2) NOT NULL, status text NOT NULL
    );
    CREATE TABLE public.project_cost_events (
      tenant_id uuid, supplier_purchase_order_id uuid, amount numeric(18,2)
    );
    CREATE TABLE public.supplier_payable_events (
      id uuid PRIMARY KEY, tenant_id uuid, supplier_purchase_order_id uuid, amount numeric(18,2)
    );
    CREATE TABLE public.supplier_payment_allocations (
      tenant_id uuid, payable_event_id uuid, amount numeric(18,2)
    );
    CREATE TABLE public.supplier_payment_requests (
      id uuid PRIMARY KEY, tenant_id uuid, status text
    );
    CREATE TABLE public.supplier_payment_request_allocations (
      tenant_id uuid, payment_request_id uuid, payable_event_id uuid,
      requested_amount numeric(18,2), paid_amount numeric(18,2)
    );
    ${definitions[0]}
    REVOKE ALL ON FUNCTION public.get_supplier_purchase_order_financial_summary(uuid,uuid)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_supplier_purchase_order_financial_summary(uuid,uuid) TO service_role;
    INSERT INTO public.supplier_purchase_order_fulfillments VALUES
      ('${tenant}', '${warehouseOrder}', 88, 'received'),
      ('${tenant}', '${projectOrder}', 120.25, 'partially_received'),
      ('${tenant}', '${rejectedOrder}', 0, 'received_with_variance'),
      ('${otherTenant}', '${foreignOrder}', 999, 'received');
    INSERT INTO public.project_cost_events VALUES ('${tenant}', '${projectOrder}', 120.25);
    INSERT INTO public.supplier_payable_events VALUES
      ('${warehouseOrder}', '${tenant}', '${warehouseOrder}', 88),
      ('${foreignOrder}', '${otherTenant}', '${foreignOrder}', 999);
    INSERT INTO public.supplier_payment_allocations VALUES ('${tenant}', '${warehouseOrder}', 20);
    INSERT INTO public.supplier_payment_requests VALUES
      ('${warehouseOrder}', '${tenant}', 'partially_paid'),
      ('${projectOrder}', '${tenant}', 'rejected');
    INSERT INTO public.supplier_payment_request_allocations VALUES
      ('${tenant}', '${warehouseOrder}', '${warehouseOrder}', 50, 20),
      ('${tenant}', '${projectOrder}', '${warehouseOrder}', 10, 0);
  `);
  // Apply the complete forward migration over the historical function and ACL.
  sql(fixMigration);
});

afterAll(() => {
  // Only this run's successfully created, random test database can be removed.
  if (created) docker(["dropdb", "-U", "postgres", database]);
});

function summary(order: string, tenantId = tenant): Record<string, string> {
  return JSON.parse(sql(`SET ROLE service_role;
    SELECT public.get_supplier_purchase_order_financial_summary('${tenantId}', '${order}');`));
}

test("warehouse receipt reports 88 without creating project costs", () => {
  expect(summary(warehouseOrder).accepted_amount).toBe("88.00");
  expect(sql(`SELECT count(*) FROM public.project_cost_events WHERE supplier_purchase_order_id='${warehouseOrder}';`)).toBe("0");
});

test("project partial receipt retains the accepted tax-inclusive amount", () => {
  expect(summary(projectOrder).accepted_amount).toBe("120.25");
});

test("rejected-only receipt and an unconfirmed order have zero accepted amount", () => {
  expect(summary(rejectedOrder).accepted_amount).toBe("0.00");
  expect(summary(missingOrder).accepted_amount).toBe("0.00");
});

test("financial amounts retain payment and reservation semantics", () => {
  expect(summary(warehouseOrder)).toEqual({
    purchase_order_id: warehouseOrder, accepted_amount: "88.00",
    payable_amount: "88.00", reserved_request_amount: "30.00",
    paid_amount: "20.00", open_amount: "68.00", available_to_request_amount: "38.00",
  });
});

test("tenant and order scopes exclude other receipts and payables", () => {
  const scoped = summary(foreignOrder);
  expect(scoped.accepted_amount).toBe("0.00");
  expect(scoped.payable_amount).toBe("0.00");
  expect(summary(foreignOrder, otherTenant).accepted_amount).toBe("999.00");
});

test("accepted amount reads fulfillment facts with bounded order lookup", () => {
  expect(latestDefinition).toContain("FROM public.supplier_purchase_order_fulfillments AS fulfillment");
  expect(latestDefinition).not.toContain("project_cost_events");
  expect(latestDefinition).toContain("fulfillment.tenant_id = p_tenant_id");
  expect(latestDefinition).toContain("fulfillment.supplier_purchase_order_id =");
});

test("forward migration keeps execution restricted to the service role", () => {
  expect(sql(`SELECT has_function_privilege('service_role',
    'public.get_supplier_purchase_order_financial_summary(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon',
    'public.get_supplier_purchase_order_financial_summary(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated',
    'public.get_supplier_purchase_order_financial_summary(uuid,uuid)', 'EXECUTE');`)).toBe("t");
});
