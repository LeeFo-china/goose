import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260729180000_create_supplier_purchase_orders.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function extractFunction(name: string) {
  const start = sql.search(
    new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

function expectContracts(source: string, contracts: readonly RegExp[]) {
  for (const contract of contracts) expect(source).toMatch(contract);
}

describe("supplier purchase order migration contract", () => {
  test("creates project-bound order and immutable snapshot item facts", () => {
    expect(sql).toContain(
      "CREATE TABLE public.supplier_purchase_orders",
    );
    expect(sql).toContain(
      "CREATE TABLE public.supplier_purchase_order_items",
    );
    expect(sql).toContain(
      "CREATE SEQUENCE public.supplier_purchase_order_number_seq",
    );
    expectContracts(sql, [
      /project_id uuid NOT NULL[\s\S]*REFERENCES public\.projects\(id\) ON DELETE RESTRICT/,
      /tenant_supplier_id uuid NOT NULL[\s\S]*supplier_id uuid NOT NULL/,
      /status text NOT NULL DEFAULT 'draft'/,
      /CHECK \(status IN \('draft', 'submitted', 'cancelled'\)\)/,
      /currency char\(3\) NOT NULL DEFAULT 'CNY'/,
      /priced_at timestamptz NOT NULL/,
      /subtotal_amount numeric\(18, 2\) NOT NULL/,
      /tax_amount numeric\(18, 2\) NOT NULL/,
      /total_amount numeric\(18, 2\) NOT NULL/,
      /version integer NOT NULL DEFAULT 1/,
      /supplier_price_list_item_id uuid NOT NULL/,
      /product_code_snapshot text NOT NULL/,
      /sku_code_snapshot text NOT NULL/,
      /purchase_unit_code_snapshot text NOT NULL/,
      /base_unit_conversion numeric\(18, 8\) NOT NULL/,
      /quantity numeric\(18, 4\) NOT NULL/,
      /unit_price numeric\(14, 2\) NOT NULL/,
      /tax_rate numeric\(7, 6\) NOT NULL/,
      /UNIQUE \(supplier_purchase_order_id, supplier_sku_id\)/,
    ]);
    expect(sql).toMatch(
      /CREATE FUNCTION public\.supplier_purchase_order_snapshot\([\s\S]*subtotal_amount::text[\s\S]*tax_amount::text[\s\S]*total_amount::text/,
    );
  });

  test("enforces tenant and supplier ownership with database constraints", () => {
    expectContracts(sql, [
      /UNIQUE \(id, tenant_id\)/,
      /UNIQUE \(id, tenant_id, supplier_id\)/,
      /FOREIGN KEY \(tenant_supplier_id, tenant_id\)[\s\S]*REFERENCES public\.tenant_suppliers\(id, tenant_id\)/,
      /FOREIGN KEY \(supplier_purchase_order_id, tenant_id\)[\s\S]*REFERENCES public\.supplier_purchase_orders\(id, tenant_id\)/,
      /FOREIGN KEY \(supplier_sku_id, supplier_id\)[\s\S]*REFERENCES public\.supplier_skus\(id, supplier_id\)/,
      /validate_supplier_purchase_order_scope/,
      /project\.tenant_id = NEW\.tenant_id/,
      /relationship\.supplier_id = NEW\.supplier_id/,
    ]);
  });

  test("adds bounded list and item lookup indexes", () => {
    for (const index of [
      "supplier_purchase_orders_tenant_status_updated_idx",
      "supplier_purchase_orders_tenant_project_updated_idx",
      "supplier_purchase_orders_tenant_relationship_updated_idx",
      "supplier_purchase_order_items_order_line_idx",
      "supplier_price_items_supplier_sku_order_idx",
    ]) {
      expect(sql).toContain(`CREATE INDEX ${index}`);
    }
  });

  test("forces RLS and limits direct table access to service role", () => {
    for (const table of [
      "supplier_purchase_orders",
      "supplier_purchase_order_items",
    ]) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*supplier_purchase_orders[\s\S]*supplier_purchase_order_items[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE[\s\S]*supplier_purchase_orders[\s\S]*supplier_purchase_order_items[\s\S]*TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT[\s\S]{0,100}(INSERT|UPDATE|DELETE)[\s\S]{0,160}supplier_purchase_orders/,
    );
  });

  test("resolves one paginated effective CNY base price catalog set", () => {
    const fn = extractFunction("resolve_supplier_purchase_order_catalog");
    expectContracts(fn, [
      /p_tenant_id uuid[\s\S]*p_tenant_supplier_id uuid[\s\S]*p_priced_at timestamptz[\s\S]*p_keyword text[\s\S]*p_page integer DEFAULT 1[\s\S]*p_page_size integer DEFAULT 20/,
      /LEAST\(GREATEST\(COALESCE\(p_page_size, 20\), 1\), 100\)/,
      /eligible_prices AS MATERIALIZED/,
      /price_list\.lifecycle_status = 'published'/,
      /price_list\.scope_type = 'default'/,
      /price_list\.currency = 'CNY'/,
      /relationship\.default_currency = 'CNY'/,
      /price_item\.unit_price::text AS unit_price/,
      /price_item\.tax_rate::text AS tax_rate/,
      /price_list\.effective_from <= p_priced_at/,
      /price_list\.effective_until IS NULL[\s\S]*price_list\.effective_until > p_priced_at/,
      /product\.status = 'active'/,
      /sku\.status = 'active'/,
      /SELECT count\(\*\)[\s\S]*FROM eligible_prices/,
      /ORDER BY[\s\S]*LIMIT v_page_size[\s\S]*OFFSET \(v_page - 1\) \* v_page_size/,
      /'items',[\s\S]*'total',[\s\S]*'page',[\s\S]*'page_size'/,
    ]);
    expect((fn.match(/FROM public\.supplier_price_list_items/g) ?? []))
      .toHaveLength(1);
  });

  test("saves the entire draft with one price instant and one set query", () => {
    const fn = extractFunction("save_supplier_purchase_order_draft");
    expectContracts(fn, [
      /p_order_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_project_id uuid[\s\S]*p_tenant_supplier_id uuid[\s\S]*p_expected_version integer[\s\S]*p_items jsonb/,
      /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/,
      /v_priced_at := clock_timestamp\(\)/,
      /FROM public\.tenant_suppliers AS relationship[\s\S]*FOR SHARE OF relationship, supplier/,
      /relationship\.default_currency = 'CNY'/,
      /requested_items AS MATERIALIZED/,
      /COUNT\(\*\) <> COUNT\(DISTINCT supplier_sku_id\)/,
      /scale\(quantity\) > 4/,
      /supplier_sku_id IS NULL/,
      /quantity IS NULL/,
      /resolved_items AS MATERIALIZED/,
      /SUPPLIER_PURCHASE_ORDER_PRICE_MISSING/,
      /DELETE FROM public\.supplier_purchase_order_items/,
      /INSERT INTO public\.supplier_purchase_order_items/,
      /row_number\(\) OVER/,
      /SUM\([\s\S]*subtotal_amount/,
      /UPDATE public\.supplier_purchase_orders[\s\S]*version = version \+ 1/,
    ]);
    expect((fn.match(/FROM public\.supplier_price_list_items/g) ?? []))
      .toHaveLength(1);
  });

  test("uses request fingerprints for exact idempotent replay", () => {
    for (const name of [
      "save_supplier_purchase_order_draft",
      "submit_supplier_purchase_order",
      "cancel_supplier_purchase_order",
    ]) {
      const fn = extractFunction(name);
      expectContracts(fn, [
        /supplier_command_events/,
        /pg_advisory_xact_lock/,
        /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
        /SUPPLIER_IDEMPOTENCY_CONFLICT/,
        /'idempotent', true/,
        /INSERT INTO public\.supplier_command_events/,
      /jsonb_build_object\('_request', v_request\)/,
      /supplier_purchase_order_snapshot\(v_order\)/,
      ]);
    }
  });

  test("enforces optimistic locking and the approved state machine", () => {
    const save = extractFunction("save_supplier_purchase_order_draft");
    const submit = extractFunction("submit_supplier_purchase_order");
    const cancel = extractFunction("cancel_supplier_purchase_order");
    expectContracts(save, [
      /p_expected_version = 0/,
      /v_order\.status <> 'draft'/,
      /v_order\.version <> p_expected_version/,
      /SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT/,
      /SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT/,
    ]);
    expectContracts(submit, [
      /v_order\.status <> 'draft'/,
      /v_order\.version <> p_expected_version/,
      /FROM public\.tenant_suppliers AS relationship[\s\S]*FOR SHARE OF relationship, supplier/,
      /relationship\.default_currency = 'CNY'/,
      /SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED/,
      /status = 'submitted'/,
      /submitted_by_employee_id = p_actor_employee_id/,
    ]);
    expectContracts(cancel, [
      /v_order\.status NOT IN \('draft', 'submitted'\)/,
      /status = 'cancelled'/,
      /cancelled_by_employee_id = p_actor_employee_id/,
      /cancel_reason = btrim\(p_reason\)/,
    ]);
  });

  test("keeps database commands private to service role", () => {
    for (const name of [
      "resolve_supplier_purchase_order_catalog",
      "save_supplier_purchase_order_draft",
      "submit_supplier_purchase_order",
      "cancel_supplier_purchase_order",
    ]) {
      const fn = extractFunction(name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public");
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) FROM PUBLIC, anon, authenticated;`,
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`,
      ));
    }
  });

  test("extends command events and seeds tenant system administrator permissions", () => {
    expect(sql).toMatch(
      /supplier_command_events_resource_type_check[\s\S]*'supplier_purchase_order'/,
    );
    for (const permission of [
      "supplier.purchase-order.view",
      "supplier.purchase-order.manage",
    ]) {
      expect(sql).toContain(`'${permission}'`);
    }
    expect(sql).toMatch(
      /WHERE roles\.code = 'system_admin'[\s\S]*roles\.tenant_id IS NOT NULL/,
    );
  });

  test("documents a forward rollback that preserves submitted facts", () => {
    expect(sql).toMatch(
      /^-- Rollback:[\s\S]*forward migration[\s\S]*hide[\s\S]*preserve[\s\S]*submitted/i,
    );
  });
});
