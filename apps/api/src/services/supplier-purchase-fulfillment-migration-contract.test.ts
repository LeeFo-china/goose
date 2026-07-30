import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

function sqlFunction(schema: string, name: string) {
  const start = migration.search(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${schema}\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

function sqlObject(prefix: string, name: string, terminator: string) {
  const start = migration.indexOf(`${prefix}${name}`);
  if (start < 0) return "";
  const end = migration.indexOf(terminator, start);
  return end < 0
    ? migration.slice(start)
    : migration.slice(start, end + terminator.length);
}

function contracts(source: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) expect(source).toMatch(pattern);
}

function ordered(source: string, patterns: readonly RegExp[]) {
  let cursor = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor));
    expect(match, `missing ordered contract ${pattern}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

function envelope(source: string, status: string, errorCode: string) {
  expect(source).toMatch(
    new RegExp(
      `'status', '${status}'[\\s\\S]{0,180}'error_code',\\s*'${errorCode}'`,
    ),
  );
}

function lockOrder(
  source: string,
  itemTable: string,
  itemAlias: string,
  itemLock: "SHARE" | "UPDATE",
) {
  ordered(source, [
    /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(\s*'supplier-command:'[\s\S]*?p_idempotency_key,\s*0\s*\)\s*\)/,
    /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(\s*'supplier-purchase-order-id:'[\s\S]*?p_order_id::text,\s*6720240730100000\s*\)\s*\)/,
    /FROM public\.supplier_purchase_orders AS purchase_order[^;]*FOR UPDATE;/,
    /FROM public\.supplier_purchase_order_fulfillments AS fulfillment[^;]*ORDER BY fulfillment\.id\s*FOR UPDATE;/,
    new RegExp(
      `FROM public\\.${itemTable}[^;]*ORDER BY ${itemAlias}\\.id\\s*FOR ${itemLock};`,
    ),
  ]);
}

describe("supplier purchase fulfillment migration contract", () => {
  test("creates constrained, indexed, tenant-safe fulfillment facts", () => {
    const tables = [
      "supplier_purchase_order_fulfillments",
      "supplier_purchase_order_item_fulfillments",
      "supplier_purchase_order_shipments",
      "supplier_purchase_order_shipment_items",
      "supplier_purchase_order_receipts",
      "supplier_purchase_order_receipt_items",
    ];
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    contracts(migration, [
      /UNIQUE \(supplier_purchase_order_id\)/,
      /CHECK \(status IN \([\s\S]*'confirmed'[\s\S]*'partially_shipped'[\s\S]*'shipped'[\s\S]*'partially_received'[\s\S]*'received'[\s\S]*'received_with_variance'[\s\S]*'cancelled'/,
      /ordered_quantity numeric\(18, 4\) NOT NULL/,
      /received_quantity <= shipped_quantity[\s\S]*shipped_quantity <= ordered_quantity/,
      /accepted_quantity \+ rejected_quantity = received_quantity/,
      /UNIQUE \(supplier_purchase_order_id, shipment_no\)/,
      /UNIQUE \(supplier_purchase_order_id, receipt_no\)/,
      /supplier_purchase_order_fulfillments_tenant_status_updated_idx/,
      /supplier_purchase_order_shipments_tenant_order_shipped_idx/,
      /supplier_purchase_order_receipts_tenant_order_received_idx/,
      /ADD CONSTRAINT supplier_purchase_order_items_id_tenant_order_key[\s\S]*UNIQUE \(id, tenant_id, supplier_purchase_order_id\)/,
    ]);
    const edges: Record<string, RegExp[]> = {
      supplier_purchase_order_fulfillments: [
        /FOREIGN KEY \(supplier_purchase_order_id, tenant_id\)[\s\S]*supplier_purchase_orders\(id, tenant_id\)/,
      ],
      supplier_purchase_order_item_fulfillments: [
        /FOREIGN KEY \(supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_fulfillments/,
        /FOREIGN KEY \(supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_items/,
      ],
      supplier_purchase_order_shipments: [
        /FOREIGN KEY \(supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_fulfillments/,
      ],
      supplier_purchase_order_shipment_items: [
        /FOREIGN KEY \([\s\S]*shipment_id,[\s\S]*tenant_id,[\s\S]*supplier_purchase_order_fulfillment_id,[\s\S]*supplier_purchase_order_id[\s\S]*supplier_purchase_order_shipments/,
        /FOREIGN KEY \(supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_items/,
      ],
      supplier_purchase_order_receipts: [
        /FOREIGN KEY \(supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_fulfillments/,
      ],
      supplier_purchase_order_receipt_items: [
        /FOREIGN KEY \([\s\S]*receipt_id,[\s\S]*tenant_id,[\s\S]*supplier_purchase_order_fulfillment_id,[\s\S]*supplier_purchase_order_id[\s\S]*supplier_purchase_order_receipts/,
        /FOREIGN KEY \(supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id\)[\s\S]*supplier_purchase_order_items/,
      ],
    };
    for (const [table, patterns] of Object.entries(edges)) {
      contracts(sqlObject("CREATE TABLE public.", table, "\n);"), patterns);
    }
  });

  test("binds all six mutation guards to the exact table and function", () => {
    const triggers = {
      supplier_purchase_order_fulfillments_command_only: [
        "supplier_purchase_order_fulfillments",
        "prevent_supplier_purchase_fulfillment_direct_mutation",
      ],
      supplier_purchase_order_item_fulfillments_command_only: [
        "supplier_purchase_order_item_fulfillments",
        "prevent_supplier_purchase_fulfillment_direct_mutation",
      ],
      supplier_purchase_order_shipments_immutable: [
        "supplier_purchase_order_shipments",
        "prevent_supplier_purchase_fulfillment_event_mutation",
      ],
      supplier_purchase_order_shipment_items_immutable: [
        "supplier_purchase_order_shipment_items",
        "prevent_supplier_purchase_fulfillment_event_mutation",
      ],
      supplier_purchase_order_receipts_immutable: [
        "supplier_purchase_order_receipts",
        "prevent_supplier_purchase_fulfillment_event_mutation",
      ],
      supplier_purchase_order_receipt_items_immutable: [
        "supplier_purchase_order_receipt_items",
        "prevent_supplier_purchase_fulfillment_event_mutation",
      ],
    } as const;
    for (const [trigger, [table, fn]] of Object.entries(triggers)) {
      const block = sqlObject("CREATE TRIGGER ", trigger, ";");
      contracts(block, [
        /BEFORE INSERT OR UPDATE OR DELETE/,
        new RegExp(`ON public\\.${table}`),
        new RegExp(`EXECUTE FUNCTION\\s*public\\.${fn}\\(\\)`),
      ]);
    }
  });

  test("derives all seven statuses with exact conditions and priority", () => {
    const fn = sqlFunction(
      "private",
      "recalculate_supplier_purchase_order_fulfillment",
    );
    const branches = [
      /WHEN fulfillment\.status = 'cancelled' THEN 'cancelled'/,
      /WHEN amounts\.received_quantity = amounts\.ordered_quantity\s*AND amounts\.rejected_quantity > 0\s*THEN 'received_with_variance'/,
      /WHEN amounts\.received_quantity = amounts\.ordered_quantity\s*THEN 'received'/,
      /WHEN amounts\.received_quantity > 0 THEN 'partially_received'/,
      /WHEN amounts\.shipped_quantity = amounts\.ordered_quantity\s*THEN 'shipped'/,
      /WHEN amounts\.shipped_quantity > 0 THEN 'partially_shipped'/,
      /ELSE 'confirmed'/,
    ];
    contracts(fn, branches);
    ordered(fn, branches);
    contracts(fn, [
      /purchase_item\.unit_price/,
      /purchase_item\.tax_rate/,
      /purchase_item\.tax_inclusive/,
      /round\(item_fulfillment\.accepted_quantity \* purchase_item\.unit_price, 2\)/,
    ]);
  });

  test("confirms with normalized headers, complete branches, and canonical locks", () => {
    const fn = sqlFunction(
      "public",
      "confirm_supplier_purchase_order_fulfillment",
    );
    contracts(fn, [
      /v_remark text := NULLIF\(btrim\(p_remark\), ''\)/,
      /char_length\(v_remark\) > 500/,
      /v_order\.status <> 'submitted'/,
      /v_order\.version <> p_expected_order_version/,
      /IF FOUND THEN[\s\S]*SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED/,
      /IF v_item_count = 0 THEN[\s\S]*SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT/,
      /'remark', v_remark/,
      /confirmation_remark,[\s\S]*v_remark/,
      /INSERT INTO public\.supplier_command_events/,
      /'status', 'confirmed'/,
    ]);
    envelope(fn, "validation_error", "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VALIDATION_ERROR");
    envelope(fn, "not_found", "SUPPLIER_PURCHASE_ORDER_NOT_FOUND");
    envelope(fn, "state_conflict", "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT");
    envelope(fn, "version_conflict", "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT");
    envelope(fn, "state_conflict", "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED");
    lockOrder(
      fn,
      "supplier_purchase_order_items",
      "purchase_item",
      "SHARE",
    );
    expect(fn).not.toMatch(/UPDATE public\.supplier_purchase_orders/);
  });

  test("ships with bounded input, complete branches, collision proof, and locks", () => {
    const fn = sqlFunction("public", "create_supplier_purchase_order_shipment");
    contracts(fn, [
      /char_length\(btrim\(p_shipment_no\)\) > 80/,
      /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/,
      /quantity <= 0[\s\S]*scale\(quantity\) > 4[\s\S]*quantity >= 100000000000000/,
      /v_carrier_name text := NULLIF\(btrim\(p_carrier_name\), ''\)/,
      /v_tracking_no text := NULLIF\(btrim\(p_tracking_no\), ''\)/,
      /v_remark text := NULLIF\(btrim\(p_remark\), ''\)/,
      /v_fulfillment\.status IN \([\s\S]*'received'[\s\S]*'received_with_variance'[\s\S]*'cancelled'/,
      /SELECT EXISTS \([\s\S]*shipment\.id = p_shipment_id[\s\S]*INTO v_global_event_exists/,
      /IF v_global_event_exists[\s\S]*'status', 'state_conflict'[\s\S]*SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT/,
      /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
      /'shipment_no', btrim\(p_shipment_no\)[\s\S]*'carrier_name', v_carrier_name[\s\S]*'tracking_no', v_tracking_no[\s\S]*'remark', v_remark[\s\S]*'items', v_normalized_items[\s\S]*'actor_employee_id', p_actor_employee_id/,
      /jsonb_build_object\('_request', v_request\)/,
      /'status', 'shipment_created'/,
    ]);
    for (const [status, code] of [
      ["validation_error", "SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR"],
      ["not_found", "SUPPLIER_PURCHASE_ORDER_NOT_FOUND"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT"],
      ["state_conflict", "FULFILLMENT_NOT_CONFIRMED"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT"],
      ["version_conflict", "FULFILLMENT_VERSION_CONFLICT"],
      ["not_found", "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND"],
      ["over_shipped", "OVER_SHIPPED"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT"],
    ] as const) envelope(fn, status, code);
    lockOrder(
      fn,
      "supplier_purchase_order_item_fulfillments",
      "item_fulfillment",
      "UPDATE",
    );
  });

  test("receives numeric(18,4) facts and preserves raw variance presence", () => {
    const fn = sqlFunction("public", "create_supplier_purchase_order_receipt");
    contracts(fn, [
      /char_length\(btrim\(p_receipt_no\)\) > 80/,
      /v_remark text := NULLIF\(btrim\(p_remark\), ''\)/,
      /accepted_quantity \+ rejected_quantity >= 100000000000000/,
      /scale\(accepted_quantity\) > 4/,
      /scale\(rejected_quantity\) > 4/,
      /accepted_quantity >= 100000000000000/,
      /rejected_quantity >= 100000000000000/,
      /btrim\(item\.variance_reason\) AS variance_reason/,
      /item\.variance_reason IS NOT NULL AS variance_reason_provided/,
      /rejected_quantity > 0[\s\S]*variance_reason = ''/,
      /rejected_quantity = 0\s*AND variance_reason_provided/,
      /IF v_variance_reason_forbidden THEN[\s\S]*'status', 'validation_error'[\s\S]*SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR/,
      /IF v_variance_reason_required THEN[\s\S]*'status', 'variance_reason_required'[\s\S]*VARIANCE_REASON_REQUIRED/,
      /'variance_reason', requested\.variance_reason/,
      /'receipt_no', btrim\(p_receipt_no\)[\s\S]*'remark', v_remark[\s\S]*'items', v_normalized_items[\s\S]*'actor_employee_id', p_actor_employee_id/,
      /SELECT EXISTS \([\s\S]*receipt\.id = p_receipt_id[\s\S]*INTO v_global_event_exists/,
      /IF v_global_event_exists[\s\S]*'status', 'state_conflict'[\s\S]*SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT/,
      /'status', 'receipt_created'/,
    ]);
    expect(fn).not.toMatch(/NULLIF\(btrim\(item\.variance_reason\), ''\)/);
    for (const [status, code] of [
      ["validation_error", "SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR"],
      ["not_found", "SUPPLIER_PURCHASE_ORDER_NOT_FOUND"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT"],
      ["state_conflict", "FULFILLMENT_NOT_CONFIRMED"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT"],
      ["version_conflict", "FULFILLMENT_VERSION_CONFLICT"],
      ["not_found", "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND"],
      ["over_received", "OVER_RECEIVED"],
      ["variance_reason_required", "VARIANCE_REASON_REQUIRED"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT"],
    ] as const) envelope(fn, status, code);
    lockOrder(
      fn,
      "supplier_purchase_order_item_fulfillments",
      "item_fulfillment",
      "UPDATE",
    );
  });

  test("cancels with an exact fingerprint, replay envelope, branches, and locks", () => {
    const fn = sqlFunction("public", "cancel_supplier_purchase_order");
    contracts(fn, [
      /v_request := jsonb_build_object\(\s*'tenant_id', p_tenant_id,\s*'order_id', p_order_id,\s*'expected_version', p_expected_version,\s*'reason', btrim\(p_reason\),\s*'actor_employee_id', p_actor_employee_id\s*\)/,
      /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
      /v_before \|\| jsonb_build_object\('_request', v_request\)/,
      /RETURN jsonb_build_object\(\s*'status', 'cancelled',\s*'idempotent', true,\s*'purchase_order', v_event\.to_state,\s*'version', v_event\.result_version\s*\)/,
      /v_order\.status NOT IN \('draft', 'submitted'\)/,
      /v_order\.version <> p_expected_version/,
      /IF v_has_shipment THEN[\s\S]*SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED/,
      /UPDATE public\.supplier_purchase_order_fulfillments AS fulfillment[\s\S]*status = 'cancelled'/,
      /UPDATE public\.supplier_purchase_orders AS purchase_order[\s\S]*status = 'cancelled'/,
    ]);
    for (const [status, code] of [
      ["validation_error", "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR"],
      ["not_found", "SUPPLIER_PURCHASE_ORDER_NOT_FOUND"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT"],
      ["version_conflict", "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT"],
      ["state_conflict", "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED"],
      ["project_invalid", "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID"],
    ] as const) envelope(fn, status, code);
    lockOrder(
      fn,
      "supplier_purchase_order_item_fulfillments",
      "item_fulfillment",
      "UPDATE",
    );
  });

  test("keeps command grants narrow, processing set-based, and rollback safe", () => {
    for (const name of [
      "confirm_supplier_purchase_order_fulfillment",
      "create_supplier_purchase_order_shipment",
      "create_supplier_purchase_order_receipt",
      "cancel_supplier_purchase_order",
    ]) {
      const fn = sqlFunction("public", name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public, private");
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated;`),
      );
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`),
      );
    }
    expect(migration).toContain("jsonb_to_recordset(v_normalized_items)");
    expect(migration).not.toMatch(/\bLOOP\b/);
    expect(migration).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*preserve[\s\S]*fulfillment[\s\S]*audit/i,
    );
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
