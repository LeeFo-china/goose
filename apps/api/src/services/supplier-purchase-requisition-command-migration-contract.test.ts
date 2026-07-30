import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");
const fulfillmentSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql",
  import.meta.url,
), "utf8");
const hardeningSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260729190000_harden_supplier_purchase_orders.sql",
  import.meta.url,
), "utf8");

function extractFunction(name: string) {
  const start = sql.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

function expectOrdered(source: string, contracts: readonly RegExp[]) {
  let cursor = 0;
  for (const contract of contracts) {
    const match = source.slice(cursor).match(contract);
    expect(match, `missing ordered contract ${contract}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

function count(source: string, contract: RegExp) {
  return source.match(new RegExp(contract.source, "g"))?.length ?? 0;
}

function extractFrom(source: string, name: string) {
  const start = source.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`),
  );
  if (start < 0) return "";
  const end = source.indexOf("\n$$;", start);
  return end < 0 ? source.slice(start) : source.slice(start, end + 4);
}

const commands = [
  "save_supplier_purchase_requisition_draft",
  "submit_supplier_purchase_requisition",
  "review_supplier_purchase_requisition",
  "cancel_supplier_purchase_requisition",
  "convert_supplier_purchase_requisition",
] as const;

describe("supplier purchase requisition command migration contract", () => {
  test("creates five private commands with lossless success snapshots", () => {
    for (const name of commands) {
      const fn = extractFunction(name);
      expect(fn).not.toBe("");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toMatch(/SET search_path = (?:''|pg_catalog, public)/);
      expect(fn).toMatch(/'requisition', v_event\.to_state/);
      expectOrdered(fn, [
        /v_snapshot :=\s*public\.supplier_purchase_requisition_to_jsonb\(v_requisition\)/,
        /to_state[\s\S]*?v_snapshot/,
        /'requisition', v_snapshot/,
      ]);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "FROM PUBLIC, anon, authenticated;",
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "TO service_role;",
      ));
    }
    const snapshot = extractFunction("supplier_purchase_requisition_to_jsonb");
    expect(snapshot).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
    expect(snapshot).toMatch(/LANGUAGE sql[\s\S]*STABLE/);
    expect(snapshot).not.toContain("IMMUTABLE");
    for (const field of ["subtotal_amount", "tax_amount", "total_amount"]) {
      expect(snapshot).toMatch(new RegExp(`'${field}',\\s*p_requisition\\.${field}::text`));
    }
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.supplier_purchase_requisition_to_jsonb\(\s*public\.supplier_purchase_requisitions\s*\)[\s\S]*?service_role/,
    );
  });

  test("validates before the command and resource locks", () => {
    const save = extractFunction("save_supplier_purchase_requisition_draft");
    expectOrdered(save, [
      /jsonb_typeof\(p_items\) <> 'array'/,
      /jsonb_array_length\(p_items\) BETWEEN 1 AND 100/,
      /COUNT\(\*\) <> COUNT\(DISTINCT supplier_sku_id\)/,
      /scale\(quantity\) > 4/,
      /assert_supplier_purchase_order_actor/,
      /supplier-command:/,
      /supplier-purchase-requisition-id:/,
      /FROM public\.supplier_purchase_requisitions[\s\S]*FOR UPDATE/,
    ]);
    expect(save.indexOf("FROM public.projects")).toBeLessThan(
      save.indexOf("FROM public.tenant_suppliers"),
    );
    expect(save.indexOf("FROM public.tenant_suppliers")).toBeLessThan(
      save.indexOf("FROM public.supplier_price_list_items"),
    );
    expect(save).toMatch(
      /jsonb_array_elements\(p_items\)[\s\S]*jsonb_typeof\(item\.value\) <> 'object'/,
    );
    expect(save.indexOf("jsonb_typeof(item.value) <> 'object'")).toBeLessThan(
      save.indexOf("jsonb_to_recordset(p_items)"),
    );
    expect(save).toMatch(
      /invalid_text_representation OR invalid_parameter_value\s+OR numeric_value_out_of_range[\s\S]*SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR/,
    );
    expect(save).toMatch(
      /jsonb_to_recordset\(p_items\)[\s\S]*supplier_sku_id uuid[\s\S]*quantity numeric/,
    );
    expect(save).toMatch(/quantity <= 0[\s\S]*scale\(quantity\) > 4/);
  });

  test("saves immutable priced facts with one set-based catalog read", () => {
    const save = extractFunction("save_supplier_purchase_requisition_draft");
    expect(save).toMatch(
      /p_requisition_id uuid[\s\S]*p_tenant_id uuid[\s\S]*p_project_id uuid[\s\S]*p_tenant_supplier_id uuid[\s\S]*p_expected_version integer[\s\S]*p_reason text[\s\S]*p_items jsonb[\s\S]*p_actor_user_id uuid[\s\S]*p_actor_employee_id uuid[\s\S]*p_idempotency_key text/,
    );
    expect(save).toMatch(/get_tenant_supplier_order_eligibility_set/);
    expectOrdered(save, [
      /requested_items AS MATERIALIZED/,
      /price_candidates AS MATERIALIZED/,
      /FROM public\.supplier_price_list_items/,
      /JOIN public\.supplier_price_lists/,
      /JOIN public\.supplier_skus/,
      /JOIN public\.supplier_products/,
      /JOIN public\.catalog_categories/,
      /JOIN public\.catalog_units/,
      /JOIN public\.finance_cost_categories/,
      /resolved_items AS MATERIALIZED/,
      /v_resolved_count <> v_requested_count/,
      /DELETE FROM public\.supplier_purchase_requisition_items/,
      /INSERT INTO public\.supplier_purchase_requisition_items/,
    ]);
    expect(count(save, /FROM public\.supplier_price_list_items/)).toBe(1);
    expect(save).toMatch(/price_list\.lifecycle_status = 'published'/);
    expect(save).toMatch(/price_list\.currency = 'CNY'/);
    expect(save).toMatch(/relationship\.default_currency = 'CNY'/);
    expect(save).toMatch(/finance_category\.status = 'active'/);
    expect(save).toMatch(/row_number\(\) OVER/);
    expect(save).toMatch(/tax_inclusive[\s\S]*line_total_amount/);
    expect(save).toMatch(/version = requisition\.version \+ 1/);
    expect(count(save, /get_tenant_supplier_order_eligibility_set/)).toBe(1);
    expectOrdered(save, [
      /requested_items AS MATERIALIZED/,
      /eligibility AS MATERIALIZED[\s\S]*get_tenant_supplier_order_eligibility_set/,
      /price_candidates AS MATERIALIZED/,
      /JOIN eligibility/,
      /resolved_items AS MATERIALIZED/,
    ]);
  });

  test("fingerprints every command and returns stable idempotent replays", () => {
    for (const name of commands) {
      const fn = extractFunction(name);
      expect(fn).toMatch(/v_request := jsonb_build_object/);
      expect(fn).toMatch(/actor_employee_id/);
      expect(fn).toMatch(
        /v_event\.from_state -> '_request' IS DISTINCT FROM v_request/,
      );
      expect(fn).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
      expect(fn).toMatch(/'idempotent', true/);
      expect(fn).toMatch(/INSERT INTO public\.supplier_command_events/);
      expect(fn).toMatch(/jsonb_build_object\('_request', v_request\)/);
    }
  });

  test("submits one set-based budget snapshot and reserves even over budget", () => {
    const submit = extractFunction("submit_supplier_purchase_requisition");
    expectOrdered(submit, [
      /supplier-command:/,
      /supplier-purchase-requisition-id:/,
      /FROM public\.supplier_purchase_requisitions[\s\S]*FOR UPDATE/,
      /requested_by_category AS MATERIALIZED/,
    ]);
    for (const contract of [
      /FROM public\.finance_cost_categories[\s\S]*FOR UPDATE OF finance_category/,
      /FROM public\.project_cost_budgets/,
      /JOIN public\.finance_ledger_entries[\s\S]*direction = 'out'/,
      /FROM public\.project_cost_commitments/,
      /INSERT INTO public\.project_cost_commitments/,
      /status = 'pending_approval'/,
    ]) expect(submit).toMatch(contract);
    expect(submit).toMatch(/status IN \('reserved', 'converted'\)/);
    expect(submit).toMatch(/source_id <> p_requisition_id/);
    expect(submit).toMatch(/budget_amount_snapshot/);
    expect(submit).toMatch(/expense_amount_snapshot/);
    expect(submit).toMatch(/other_commitment_amount_snapshot/);
    expect(submit).toMatch(/available_amount_snapshot/);
    expect(submit).toMatch(/'within_budget'[\s\S]*'over_budget'/);
    expect(submit).toContain("SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED");
    expect(submit).toMatch(
      /JOIN public\.catalog_categories[\s\S]*catalog_category\.status = 'active'/,
    );
    expect(count(submit, /JOIN public\.catalog_units/))
      .toBeGreaterThanOrEqual(2);
    expect(submit).toMatch(/purchase_unit\.status = 'active'/);
    expect(submit).toMatch(/base_unit\.status = 'active'/);
    expect(submit).toMatch(
      /current_prices\.product_code IS DISTINCT FROM\s+frozen\.product_code_snapshot/,
    );
    expect(submit).toMatch(
      /current_prices\.purchase_unit_symbol IS DISTINCT FROM\s+frozen\.purchase_unit_symbol_snapshot/,
    );
    expect(submit).toMatch(
      /current_prices\.line_subtotal_amount IS DISTINCT FROM\s+frozen\.line_subtotal_amount/,
    );
    expect(submit).toMatch(
      /current_prices\.line_tax_amount IS DISTINCT FROM\s+frozen\.line_tax_amount/,
    );
    expect(submit).toMatch(
      /current_prices\.line_total_amount IS DISTINCT FROM\s+frozen\.line_total_amount/,
    );
  });

  test("reviews without self approval and releases rejected reservations", () => {
    const review = extractFunction("review_supplier_purchase_requisition");
    expect(review).toMatch(/p_action text[\s\S]*p_remark text/);
    expect(review).toMatch(/p_action NOT IN \('approve', 'reject'\)/);
    expect(review).toMatch(/v_requisition\.status <> 'pending_approval'/);
    expect(review).toMatch(
      /v_requisition\.created_by_employee_id = p_actor_employee_id/,
    );
    expect(review).toContain("SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW");
    expect(review).toMatch(/p_action = 'approve'[\s\S]*status = 'approved'/);
    expect(review).toMatch(
      /ELSE[\s\S]*UPDATE public\.project_cost_commitments[\s\S]*status = 'released'/,
    );
  });

  test("cancels eligible states and atomically releases active reservations", () => {
    const cancel = extractFunction("cancel_supplier_purchase_requisition");
    expect(cancel).toMatch(
      /v_requisition\.status NOT IN \(\s*'draft', 'pending_approval', 'approved'\s*\)/,
    );
    expect(cancel).toMatch(/purchase_order_id IS NOT NULL/);
    expect(cancel).toMatch(
      /UPDATE public\.project_cost_commitments[\s\S]*status = 'released'[\s\S]*status = 'reserved'/,
    );
    expect(cancel).toMatch(/status = 'cancelled'/);
    expect(cancel).toMatch(/cancel_reason = btrim\(p_reason\)/);
  });

  test("converts one approved request using frozen price facts", () => {
    const convert = extractFunction("convert_supplier_purchase_requisition");
    expect(convert).toMatch(/p_purchase_order_id uuid/);
    expect(convert).toMatch(/v_requisition\.status <> 'approved'/);
    expect(convert).toMatch(/purchase_order_id IS NOT NULL/);
    expect(convert).toContain(
      "SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED",
    );
    expect(convert).toMatch(/current_prices AS MATERIALIZED/);
    expect(convert).toMatch(/IS DISTINCT FROM frozen\.(?:unit_price|tax_rate)/);
    expect(convert).toContain(
      "SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED",
    );
    expect(convert).toMatch(
      /create_supplier_purchase_order_from_requisition\([\s\S]*p_requisition_id/,
    );
    expect(sql).toMatch(
      /inject_supplier_purchase_requisition_order_source[\s\S]*NEW\.purchase_requisition_id := v_source::uuid/,
    );
    expect(convert).toMatch(
      /UPDATE public\.project_cost_commitments[\s\S]*status = 'converted'/,
    );
    expect(convert).toMatch(
      /status = 'converted'[\s\S]*purchase_order_id = p_purchase_order_id/,
    );
    for (const contract of [
      /current_prices\.product_code IS DISTINCT FROM\s+frozen\.product_code_snapshot/,
      /current_prices\.product_name IS DISTINCT FROM\s+frozen\.product_name_snapshot/,
      /current_prices\.sku_code IS DISTINCT FROM frozen\.sku_code_snapshot/,
      /current_prices\.specification IS DISTINCT FROM\s+frozen\.specification_snapshot/,
      /current_prices\.purchase_unit_code IS DISTINCT FROM\s+frozen\.purchase_unit_code_snapshot/,
      /current_prices\.base_unit_symbol IS DISTINCT FROM\s+frozen\.base_unit_symbol_snapshot/,
      /line_subtotal_amount IS DISTINCT FROM\s+frozen\.line_subtotal_amount/,
      /line_tax_amount IS DISTINCT FROM\s+frozen\.line_tax_amount/,
      /line_total_amount IS DISTINCT FROM\s+frozen\.line_total_amount/,
      /v_current_subtotal_amount IS DISTINCT FROM\s+v_requisition\.subtotal_amount/,
      /v_current_tax_amount IS DISTINCT FROM v_requisition\.tax_amount/,
      /v_current_total_amount IS DISTINCT FROM v_requisition\.total_amount/,
    ]) expect(convert).toMatch(contract);
  });

  test("blocks direct order creation and preserves linked draft provenance", () => {
    const saveOrder = extractFunction("save_supplier_purchase_order_draft");
    expect(saveOrder).toMatch(/p_purchase_requisition_id uuid DEFAULT NULL/);
    expect(saveOrder).toMatch(
      /p_expected_version = 0[\s\S]*SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT/,
    );
    expect(saveOrder).toMatch(
      /v_requisition\.status <> 'approved'[\s\S]*v_requisition\.purchase_order_id IS NOT NULL/,
    );
    expect(saveOrder).toMatch(
      /p_expected_version > 0[\s\S]*purchase_requisition_id IS DISTINCT FROM\s+p_purchase_requisition_id/,
    );
    const commandLock = saveOrder.indexOf("supplier-command:");
    const orderLock = saveOrder.indexOf("supplier-purchase-order-id:");
    const tenantRow = saveOrder.indexOf(
      "SELECT purchase_order.* INTO v_order",
    );
    const globalCheck = saveOrder.indexOf("SELECT EXISTS (", tenantRow);
    const idConflict = saveOrder.indexOf(
      "SUPPLIER_PURCHASE_ORDER_ID_CONFLICT",
    );
    expect(commandLock).toBeLessThan(orderLock);
    expect(orderLock).toBeLessThan(tenantRow);
    expect(tenantRow).toBeLessThan(globalCheck);
    expect(globalCheck).toBeLessThan(idConflict);
    expect(saveOrder).toMatch(
      /WHEN numeric_value_out_of_range[\s\S]*SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED/,
    );
    expect(sql).toMatch(
      /DROP FUNCTION public\.save_supplier_purchase_order_draft\(\s*uuid,\s*uuid,\s*uuid,\s*uuid,\s*integer,\s*date,\s*text,\s*jsonb,\s*uuid,\s*uuid,\s*text\s*\)/,
    );
  });

  test("order cancellation keeps fulfillment guards and releases conversion", () => {
    const cancelOrder = extractFunction("cancel_supplier_purchase_order");
    const fulfillmentCancel = extractFrom(
      fulfillmentSql,
      "cancel_supplier_purchase_order",
    );
    expect(fulfillmentCancel).toContain(
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
    );
    expect(fulfillmentCancel).toMatch(/supplier_purchase_order_fulfillments/);
    expect(fulfillmentCancel).toMatch(/supplier_purchase_order_shipments/);
    expect(sql).toMatch(
      /ALTER FUNCTION public\.cancel_supplier_purchase_order\([\s\S]*\) RENAME TO cancel_supplier_purchase_order_fulfillment_v1/,
    );
    expect(cancelOrder).toMatch(
      /cancel_supplier_purchase_order_fulfillment_v1\(/,
    );
    expect(cancelOrder).toMatch(
      /purchase_requisition_id IS NOT NULL[\s\S]*UPDATE public\.project_cost_commitments[\s\S]*status = 'released'[\s\S]*status = 'converted'/,
    );
    expect(cancelOrder).toMatch(/order_cancel/);
    expect(cancelOrder).not.toMatch(
      /UPDATE public\.supplier_purchase_requisitions[\s\S]*status = 'approved'/,
    );
  });

  test("contains source in the PO fingerprint and clears the local source guard", () => {
    const saveOrder = extractFunction("save_supplier_purchase_order_draft");
    const createOrder = extractFunction(
      "create_supplier_purchase_order_from_requisition",
    );
    expect(saveOrder).toMatch(
      /item\.value \|\| jsonb_build_object\(\s*'_purchase_requisition_id'/,
    );
    expect(saveOrder).toMatch(/SUPPLIER_IDEMPOTENCY_CONFLICT/);
    expect(createOrder).toMatch(
      /item\.value \|\| jsonb_build_object\(\s*'_purchase_requisition_id'/,
    );
    expect(createOrder).toMatch(
      /'supplier-internal:' \|\| gen_random_uuid\(\)::text/,
    );
    expect(count(
      createOrder,
      /set_config\(\s*'private\.supplier_purchase_requisition_source'/,
    )).toBeGreaterThanOrEqual(3);
    expect(saveOrder).not.toMatch(
      /private\.supplier_purchase_requisition_conversion/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.inject_supplier_purchase_requisition_order_source\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(hardeningSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.save_supplier_purchase_order_draft_v1\([\s\S]*service_role/,
    );
  });

  test("locks commitments deterministically before every bulk release or conversion", () => {
    for (const [name, finalStatus] of [
      ["review_supplier_purchase_requisition", "released"],
      ["cancel_supplier_purchase_requisition", "released"],
      ["convert_supplier_purchase_requisition", "converted"],
      ["cancel_supplier_purchase_order", "released"],
    ] as const) {
      const fn = extractFunction(name);
      expectOrdered(fn, [
        /FROM public\.project_cost_commitments AS commitment/,
        /ORDER BY commitment\.cost_category_id, commitment\.id/,
        /FOR UPDATE/,
        /UPDATE public\.project_cost_commitments AS commitment/,
        new RegExp(`status = '${finalStatus}'`),
      ]);
    }
  });

  test("documents set-query plans and retains the active commitment index", () => {
    expect(sql).toMatch(/EXPLAIN[\s\S]*requisition draft catalog/i);
    expect(sql).toMatch(/EXPLAIN[\s\S]*requisition budget reservation/i);
    expect(sql).toMatch(
      /project_cost_commitments_active_lookup_idx[\s\S]*WHERE status IN \('reserved', 'converted'\)/,
    );
    expect(sql).toMatch(
      /project_cost_commitments_active_lookup_idx[\s\S]*tenant\/project\/category\/status[\s\S]*(?:Index Scan|Bitmap Index Scan)[\s\S]*no unbounded full table scan/i,
    );
  });

  test("hardens event writes and serializes every project budget mutation", () => {
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE\s+public\.supplier_command_events\s+FROM service_role/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.supplier_command_events TO service_role/,
    );
    const lock = extractFunction("lock_project_cost_budget_scope");
    expect(lock).toMatch(/pg_advisory_xact_lock/);
    expect(lock).toMatch(/supplier-project-budget:/);
    const submit = extractFunction("submit_supplier_purchase_requisition");
    expect(submit).toMatch(
      /lock_project_cost_budget_scope\(\s*p_tenant_id,\s*v_requisition\.project_id\s*\)/,
    );
    expect(submit.indexOf("lock_project_cost_budget_scope")).toBeLessThan(
      submit.indexOf("FROM public.project_cost_budgets"),
    );
    const saveBudgets = extractFunction("save_project_cost_budgets");
    expect(saveBudgets).toContain("SECURITY DEFINER");
    expect(saveBudgets).toContain("SET search_path = pg_catalog, public");
    expect(saveBudgets).toMatch(/lock_project_cost_budget_scope/);
    const ledgerGuard = extractFunction("lock_finance_ledger_project_budget");
    expect(ledgerGuard).toContain("SECURITY DEFINER");
    expect(ledgerGuard).toMatch(/lock_project_cost_budget_scope/g);
    expect(sql).toMatch(
      /CREATE TRIGGER finance_ledger_entries_project_budget_lock[\s\S]*BEFORE INSERT OR UPDATE OR DELETE/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE\s+public\.project_cost_budgets\s+FROM service_role/,
    );
    expect(sql).toMatch(
      /finance_ledger_entries_out_project_category_amount_idx[\s\S]*INCLUDE \(amount\)[\s\S]*WHERE direction = 'out' AND project_id IS NOT NULL/,
    );
  });

  test("uses an owner-only unpredictable PO creation channel", () => {
    const publicSave = extractFunction("save_supplier_purchase_order_draft");
    expect(publicSave).toMatch(
      /p_expected_version = 0[\s\S]*SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT/,
    );
    const helper = extractFunction(
      "create_supplier_purchase_order_from_requisition",
    );
    expect(helper).toContain("SECURITY DEFINER");
    expect(helper).toMatch(/gen_random_uuid\(\)/);
    expectOrdered(helper, [
      /pg_advisory_xact_lock\([\s\S]*'supplier-purchase-order-id:' \|\| p_order_id::text[\s\S]*6720240729190000/,
      /SELECT EXISTS \([\s\S]*FROM public\.supplier_purchase_orders[\s\S]*purchase_order\.id = p_order_id/,
      /SUPPLIER_PURCHASE_ORDER_ID_CONFLICT/,
      /save_supplier_purchase_order_draft_v1/,
    ]);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.create_supplier_purchase_order_from_requisition\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    const convert = extractFunction("convert_supplier_purchase_requisition");
    expect(convert).toMatch(
      /create_supplier_purchase_order_from_requisition\(/,
    );
    expectOrdered(convert, [
      /create_supplier_purchase_order_from_requisition\(/,
      /IF v_order_result ->> 'status' <> 'saved' THEN[\s\S]*RETURN v_order_result/,
      /UPDATE public\.project_cost_commitments/,
      /UPDATE public\.supplier_purchase_requisitions/,
    ]);
    expect(convert).not.toMatch(/requisition-order:/);
    expect(convert).not.toMatch(
      /private\.supplier_purchase_requisition_conversion/,
    );
  });

  test("returns a stable conflict for globally occupied requisition ids", () => {
    const save = extractFunction("save_supplier_purchase_requisition_draft");
    expectOrdered(save, [
      /supplier-purchase-requisition-id:/,
      /FROM public\.supplier_purchase_requisitions[\s\S]*FOR UPDATE/,
      /SELECT EXISTS \([\s\S]*FROM public\.supplier_purchase_requisitions/,
      /SUPPLIER_PURCHASE_REQUISITION_ID_CONFLICT/,
    ]);
  });

  test("keeps the command contract file under the repository limit", () => {
    expect(readFileSync(import.meta.filename, "utf8").split("\n").length)
      .toBeLessThanOrEqual(500);
  });
});
