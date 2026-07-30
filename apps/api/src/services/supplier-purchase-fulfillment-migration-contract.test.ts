import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

function extractFunction(schema: string, name: string) {
  const start = migration.search(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${schema}\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

function expectContracts(source: string, contracts: readonly RegExp[]) {
  for (const contract of contracts) expect(source).toMatch(contract);
}

describe("supplier purchase fulfillment migration contract", () => {
  test("creates the fulfillment accumulator and immutable shipment/receipt facts", () => {
    for (const table of [
      "supplier_purchase_order_fulfillments",
      "supplier_purchase_order_item_fulfillments",
      "supplier_purchase_order_shipments",
      "supplier_purchase_order_shipment_items",
      "supplier_purchase_order_receipts",
      "supplier_purchase_order_receipt_items",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
    }

    expectContracts(migration, [
      /UNIQUE \(supplier_purchase_order_id\)/,
      /CHECK \(status IN \([\s\S]*'confirmed'[\s\S]*'partially_shipped'[\s\S]*'shipped'[\s\S]*'partially_received'[\s\S]*'received'[\s\S]*'received_with_variance'[\s\S]*'cancelled'/,
      /confirmed_at timestamptz NOT NULL/,
      /confirmed_by_user_id uuid NOT NULL/,
      /confirmed_by_employee_id uuid NOT NULL/,
      /version integer NOT NULL DEFAULT 1/,
      /ordered_quantity numeric\(18, 4\) NOT NULL/,
      /shipped_quantity numeric\(18, 4\) NOT NULL DEFAULT 0/,
      /received_quantity numeric\(18, 4\) NOT NULL DEFAULT 0/,
      /accepted_quantity numeric\(18, 4\) NOT NULL DEFAULT 0/,
      /rejected_quantity numeric\(18, 4\) NOT NULL DEFAULT 0/,
      /accepted_subtotal_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /accepted_tax_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /accepted_total_amount numeric\(18, 2\) NOT NULL DEFAULT 0/,
      /received_quantity <= shipped_quantity[\s\S]*shipped_quantity <= ordered_quantity/,
      /accepted_quantity \+ rejected_quantity = received_quantity/,
      /accepted_quantity \+ rejected_quantity > 0/,
      /rejected_quantity > 0[\s\S]*variance_reason IS NOT NULL/,
      /rejected_quantity = 0[\s\S]*variance_reason IS NULL/,
      /UNIQUE \(supplier_purchase_order_id, shipment_no\)/,
      /UNIQUE \(supplier_purchase_order_id, receipt_no\)/,
    ]);
  });

  test("uses tenant-safe composite foreign keys for every fact edge", () => {
    expectContracts(migration, [
      /ADD CONSTRAINT supplier_purchase_order_items_id_tenant_order_key[\s\S]*UNIQUE \(id, tenant_id, supplier_purchase_order_id\)/,
      /FOREIGN KEY \(supplier_purchase_order_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_orders\(id, tenant_id\)/,
      /FOREIGN KEY \(supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id\)[\s\S]*REFERENCES public\.supplier_purchase_order_fulfillments\([\s\S]*id, tenant_id, supplier_purchase_order_id/,
      /FOREIGN KEY \(supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id\)[\s\S]*REFERENCES public\.supplier_purchase_order_items\([\s\S]*id, tenant_id, supplier_purchase_order_id/,
    ]);
    expect(migration).toContain(
      "FOREIGN KEY (\n      shipment_id,\n      tenant_id,\n      supplier_purchase_order_fulfillment_id,\n      supplier_purchase_order_id\n    )\n    REFERENCES public.supplier_purchase_order_shipments(",
    );
    expect(migration).toContain(
      "FOREIGN KEY (\n      receipt_id,\n      tenant_id,\n      supplier_purchase_order_fulfillment_id,\n      supplier_purchase_order_id\n    )\n    REFERENCES public.supplier_purchase_order_receipts(",
    );
  });

  test("matches the existing repository column and strict envelope contracts", () => {
    expectContracts(migration, [
      /shipment_id uuid NOT NULL/,
      /receipt_id uuid NOT NULL/,
      /variance_reason text NULL/,
      /received_by_employee_id uuid NOT NULL/,
      /'fulfillment', private\.supplier_purchase_order_fulfillment_snapshot\([\s\S]*v_fulfillment/,
      /'status', 'over_shipped'/,
      /'status', 'over_received'/,
      /'status', 'variance_reason_required'/,
      /WHEN invalid_parameter_value OR invalid_text_representation OR numeric_value_out_of_range THEN/,
    ]);
    expect(migration).not.toContain(
      "'fulfillment', to_jsonb(v_fulfillment)",
    );
    expect(migration).not.toMatch(/'shipment', to_jsonb\(v_shipment\)/);
    expect(migration).not.toMatch(/'receipt', to_jsonb\(v_receipt\)/);
    expect(migration).not.toMatch(
      /jsonb_to_recordset\(v_normalized_items\)[\s\S]{0,180}supplier_purchase_order_item_id uuid/,
    );
  });

  test("adds bounded-list and event-item indexes", () => {
    for (const index of [
      "supplier_purchase_order_fulfillments_tenant_status_updated_idx",
      "supplier_purchase_order_shipments_tenant_order_shipped_idx",
      "supplier_purchase_order_receipts_tenant_order_received_idx",
      "supplier_purchase_order_shipment_items_parent_item_idx",
      "supplier_purchase_order_receipt_items_parent_item_idx",
    ]) {
      expect(migration).toContain(`CREATE INDEX ${index}`);
    }
    expect(migration).toMatch(
      /tenant_id,\s*status,\s*updated_at DESC,\s*id DESC/,
    );
    expect(migration).toMatch(
      /tenant_id,\s*supplier_purchase_order_id,\s*shipped_at DESC,\s*id DESC/,
    );
    expect(migration).toMatch(
      /tenant_id,\s*supplier_purchase_order_id,\s*received_at DESC,\s*id DESC/,
    );
  });

  test("forces RLS and exposes no direct business writes", () => {
    for (const table of [
      "supplier_purchase_order_fulfillments",
      "supplier_purchase_order_item_fulfillments",
      "supplier_purchase_order_shipments",
      "supplier_purchase_order_shipment_items",
      "supplier_purchase_order_receipts",
      "supplier_purchase_order_receipt_items",
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*supplier_purchase_order_fulfillments[\s\S]*supplier_purchase_order_receipt_items[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE[\s\S]*supplier_purchase_order_fulfillments[\s\S]*supplier_purchase_order_receipt_items[\s\S]*TO service_role/,
    );
    expect(migration).not.toMatch(
      /GRANT (?:INSERT|UPDATE|DELETE)[\s\S]{0,240}supplier_purchase_order_(?:fulfillments|shipments|receipts)/,
    );
    expect(migration).toContain(
      "prevent_supplier_purchase_fulfillment_direct_mutation",
    );
    expect(migration).toContain(
      "prevent_supplier_purchase_fulfillment_event_mutation",
    );
  });

  test("recalculates cumulative amounts from frozen purchase item pricing", () => {
    const fn = extractFunction(
      "private",
      "recalculate_supplier_purchase_order_fulfillment",
    );
    expectContracts(fn, [
      /RETURNS public\.supplier_purchase_order_fulfillments/,
      /SUM\(item_fulfillment\.ordered_quantity\)/,
      /SUM\(item_fulfillment\.shipped_quantity\)/,
      /SUM\(item_fulfillment\.received_quantity\)/,
      /SUM\(item_fulfillment\.accepted_quantity\)/,
      /SUM\(item_fulfillment\.rejected_quantity\)/,
      /purchase_item\.unit_price/,
      /purchase_item\.tax_rate/,
      /purchase_item\.tax_inclusive/,
      /round\(item_fulfillment\.accepted_quantity \* purchase_item\.unit_price, 2\)/,
      /1 \+ purchase_item\.tax_rate/,
      /received_with_variance/,
      /partially_received/,
      /partially_shipped/,
      /ORDER BY item_fulfillment\.id/,
    ]);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.recalculate_supplier_purchase_order_fulfillment\(uuid\) FROM PUBLIC, anon, authenticated, service_role/,
    );
  });

  test("confirms once without changing the submitted purchase order", () => {
    const fn = extractFunction(
      "public",
      "confirm_supplier_purchase_order_fulfillment",
    );
    expectContracts(fn, [
      /p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_order_version integer[\s\S]*p_confirmed_at timestamptz[\s\S]*p_remark text[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /status', 'validation_error'/,
      /assert_supplier_purchase_order_actor/,
      /supplier-command:/,
      /supplier-purchase-order-id:/,
      /6720240730100000/,
      /purchase_order\.tenant_id = p_tenant_id[\s\S]*FOR UPDATE/,
      /v_order\.status <> 'submitted'/,
      /v_order\.version <> p_expected_order_version/,
      /SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT/,
      /INSERT INTO public\.supplier_purchase_order_fulfillments/,
      /INSERT INTO public\.supplier_purchase_order_item_fulfillments[\s\S]*SELECT[\s\S]*purchase_item\.quantity/,
      /ORDER BY purchase_item\.id/,
      /'status', 'confirmed'/,
      /'purchase_order', public\.supplier_purchase_order_snapshot\(v_order\)/,
      /'fulfillment'/,
      /'version', 1/,
    ]);
    expect(fn).not.toMatch(/UPDATE public\.supplier_purchase_orders/);
  });

  test("ships a unique set of at most 100 purchase items atomically", () => {
    const fn = extractFunction(
      "public",
      "create_supplier_purchase_order_shipment",
    );
    expectContracts(fn, [
      /p_shipment_id uuid[\s\S]*p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_fulfillment_version integer[\s\S]*p_shipment_no text[\s\S]*p_shipped_at timestamptz[\s\S]*p_items jsonb[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/,
      /COUNT\(\*\) <> COUNT\(DISTINCT purchase_order_item_id\)/,
      /scale\(quantity\) > 4/,
      /quantity <= 0/,
      /assert_supplier_purchase_order_actor/,
      /ORDER BY item_fulfillment\.id[\s\S]*FOR UPDATE/,
      /v_order\.status <> 'submitted'/,
      /FULFILLMENT_NOT_CONFIRMED/,
      /FULFILLMENT_VERSION_CONFLICT/,
      /OVER_SHIPPED/,
      /INSERT INTO public\.supplier_purchase_order_shipments/,
      /INSERT INTO public\.supplier_purchase_order_shipment_items/,
      /UPDATE public\.supplier_purchase_order_item_fulfillments/,
      /recalculate_supplier_purchase_order_fulfillment/,
      /version = fulfillment\.version \+ 1/,
      /'status', 'shipment_created'/,
    ]);
  });

  test("receives accepted and rejected quantities without exceeding shipped facts", () => {
    const fn = extractFunction(
      "public",
      "create_supplier_purchase_order_receipt",
    );
    expectContracts(fn, [
      /p_receipt_id uuid[\s\S]*p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_fulfillment_version integer[\s\S]*p_receipt_no text[\s\S]*p_received_at timestamptz[\s\S]*p_items jsonb[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/,
      /COUNT\(\*\) <> COUNT\(DISTINCT purchase_order_item_id\)/,
      /accepted_quantity < 0/,
      /rejected_quantity < 0/,
      /accepted_quantity \+ rejected_quantity <= 0/,
      /VARIANCE_REASON_REQUIRED/,
      /ORDER BY item_fulfillment\.id[\s\S]*FOR UPDATE/,
      /FULFILLMENT_NOT_CONFIRMED/,
      /FULFILLMENT_VERSION_CONFLICT/,
      /OVER_RECEIVED/,
      /INSERT INTO public\.supplier_purchase_order_receipts/,
      /INSERT INTO public\.supplier_purchase_order_receipt_items/,
      /UPDATE public\.supplier_purchase_order_item_fulfillments/,
      /recalculate_supplier_purchase_order_fulfillment/,
      /version = fulfillment\.version \+ 1/,
      /'status', 'receipt_created'/,
    ]);
  });

  test("uses exact normalized command fingerprints and stable envelopes", () => {
    for (const name of [
      "confirm_supplier_purchase_order_fulfillment",
      "create_supplier_purchase_order_shipment",
      "create_supplier_purchase_order_receipt",
    ]) {
      const fn = extractFunction("public", name);
      expectContracts(fn, [
        /supplier_command_events/,
        /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
        /SUPPLIER_IDEMPOTENCY_CONFLICT/,
        /jsonb_build_object\('_request', v_request\)/,
        /'resource_type'|supplier_purchase_order/,
        /'idempotent', true/,
        /INSERT INTO public\.supplier_command_events/,
      ]);
    }

    for (const name of [
      "create_supplier_purchase_order_shipment",
      "create_supplier_purchase_order_receipt",
    ]) {
      const fn = extractFunction("public", name);
      expectContracts(fn, [
        /'event_id', p_(?:shipment|receipt)_id/,
        /jsonb_agg\([\s\S]*ORDER BY requested\.purchase_order_item_id/,
        /'actor_employee_id', p_actor_employee_id/,
        /SELECT EXISTS \([\s\S]*WHERE (?:shipment|receipt)\.id = p_(?:shipment|receipt)_id/,
      ]);
    }

    for (const token of [
      "validation_error",
      "not_found",
      "version_conflict",
      "state_conflict",
      "FULFILLMENT_NOT_CONFIRMED",
      "FULFILLMENT_VERSION_CONFLICT",
      "OVER_SHIPPED",
      "OVER_RECEIVED",
      "VARIANCE_REASON_REQUIRED",
    ]) {
      expect(migration).toContain(token);
    }
  });

  test("uses one lock order and set-based item processing", () => {
    for (const name of [
      "confirm_supplier_purchase_order_fulfillment",
      "create_supplier_purchase_order_shipment",
      "create_supplier_purchase_order_receipt",
      "cancel_supplier_purchase_order",
    ]) {
      const fn = extractFunction("public", name);
      const validation = fn.indexOf("IF p_order_id IS NULL");
      const actor = fn.indexOf(
        "PERFORM public.assert_supplier_purchase_order_actor",
      );
      const commandLock = fn.indexOf("'supplier-command:'");
      const orderLock = fn.indexOf("'supplier-purchase-order-id:'");
      const rowLock = fn.indexOf("FOR UPDATE");

      expect(validation).toBeGreaterThan(-1);
      expect(validation).toBeLessThan(actor);
      expect(actor).toBeLessThan(commandLock);
      expect(commandLock).toBeLessThan(orderLock);
      expect(orderLock).toBeLessThan(rowLock);
    }
    expect(migration).toContain("jsonb_to_recordset(v_normalized_items)");
    expect(migration).not.toMatch(/\bLOOP\b/);
  });

  test("cancels only fulfillment that has no shipment and preserves order facts", () => {
    const fn = extractFunction("public", "cancel_supplier_purchase_order");
    expectContracts(fn, [
      /CREATE OR REPLACE FUNCTION public\.cancel_supplier_purchase_order/,
      /p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_expected_version integer[\s\S]*p_reason text[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
      /supplier-purchase-order-id:/,
      /6720240730100000/,
      /FROM public\.supplier_purchase_order_shipments/,
      /SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED/,
      /UPDATE public\.supplier_purchase_order_fulfillments AS fulfillment[\s\S]*status = 'cancelled'[\s\S]*version = fulfillment\.version \+ 1/,
      /UPDATE public\.supplier_purchase_orders AS purchase_order[\s\S]*status = 'cancelled'/,
      /submitted_by_employee_id/,
      /submitted_at/,
    ]);
  });

  test("keeps all commands private to service role", () => {
    for (const name of [
      "confirm_supplier_purchase_order_fulfillment",
      "create_supplier_purchase_order_shipment",
      "create_supplier_purchase_order_receipt",
      "cancel_supplier_purchase_order",
    ]) {
      const fn = extractFunction("public", name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public, private");
      expect(migration).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated;`,
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`,
        ),
      );
    }
  });

  test("documents forward rollback that preserves fulfillment audit facts", () => {
    expect(migration).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*preserve[\s\S]*fulfillment[\s\S]*audit/i,
    );
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
