import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../../../../supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql",
  import.meta.url,
), "utf8");
const plan = readFileSync(new URL(
  "../../../../docs/superpowers/plans/2026-08-26-supplier-purchase-batch-backend.md",
  import.meta.url,
), "utf8");

function extractFunction(name: string): string {
  const starts = [...sql.matchAll(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`,
    "g",
  ))];
  const start = starts.at(-1)?.index;
  if (start === undefined) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? "" : sql.slice(start, end + 4);
}

function expectOrdered(source: string, contracts: readonly RegExp[]) {
  let cursor = 0;
  for (const contract of contracts) {
    const match = source.slice(cursor).match(contract);
    expect(match, `missing ordered contract ${contract}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

describe("supplier purchase batch atomic review migration", () => {
  test("documents conversion only after nested order submission", () => {
    const task = plan.slice(plan.indexOf("### Task 6:"),
      plan.indexOf("### Task 7:"));
    expect(task).toMatch(
      /copies the child\s+requisition's frozen[\s\S]*?draft purchase order/,
    );
    expect(task).toMatch(
      /only after[\s\S]*submit_supplier_purchase_order[\s\S]*marks? the child[\s\S]*converted/i,
    );
    expect(task).not.toMatch(/draft purchase order; marks the child\s+`converted`/);
  });

  test("hardens order submission with the tenant price identity and facts", () => {
    const submit = extractFunction("submit_supplier_purchase_order");
    expect(submit).not.toBe("");
    expect(submit).toContain(
      "'supplier-price-publish:' || p_tenant_id::text || ':' ||",
    );
    expect(submit).toMatch(
      /price_item\.tenant_id = p_tenant_id[\s\S]*price_list\.tenant_id = p_tenant_id/,
    );
    expect(submit).toMatch(
      /price_list\.tenant_supplier_id = v_order\.tenant_supplier_id/,
    );
    expect(submit).toMatch(
      /price_item\.supplier_product_id = order_item\.supplier_product_id/,
    );
    expect(submit).toMatch(
      /sum\(item\.subtotal_amount\)[\s\S]*?sum\(item\.tax_amount\)[\s\S]*?sum\(item\.total_amount\)[\s\S]*?v_order\.subtotal_amount/,
    );
    expect(submit).toMatch(
      /catalog_categories[\s\S]*?catalog_brands[\s\S]*?ownership_scope/,
    );
    expect(submit).toMatch(
      /v_checked_at timestamptz := statement_timestamp\(\)/,
    );
    for (const amount of ["subtotal_amount", "tax_amount", "total_amount"]) {
      expect(submit).not.toMatch(new RegExp(
        `END::numeric\\(18,2\\) AS ${amount}`,
      ));
    }
    expect(submit).toMatch(
      /FOR SHARE OF price_item, price_list, sku, product[\s\S]*purchase_unit[\s\S]*base_unit/,
    );
    for (const fact of [
      "unit_price", "tax_rate", "tax_inclusive", "purchase_unit_id",
      "base_unit_id", "base_unit_conversion", "product_code_snapshot",
      "product_name_snapshot", "sku_code_snapshot", "sku_name_snapshot",
      "specification_snapshot", "model_snapshot",
      "purchase_unit_code_snapshot", "purchase_unit_name_snapshot",
      "purchase_unit_symbol_snapshot", "base_unit_code_snapshot",
      "base_unit_name_snapshot", "base_unit_symbol_snapshot",
    ]) expect(submit, `missing submit fact ${fact}`).toContain(fact);
    expectOrdered(submit, [
      /FROM public\.tenant_suppliers[\s\S]*?FOR SHARE/,
      /supplier-price-publish:/,
      /FROM public\.supplier_purchase_orders[\s\S]*?FOR UPDATE/,
      /current_price_candidates AS MATERIALIZED/,
      /status = 'submitted'/,
    ]);
  });

  test("keeps the batch converter owner-private and copies frozen facts", () => {
    const helper = extractFunction(
      "convert_supplier_purchase_requisition_for_batch",
    );
    expect(helper).not.toBe("");
    expect(helper).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.convert_supplier_purchase_requisition_for_batch\([\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.convert_supplier_purchase_requisition_for_batch/,
    );
    expect(helper).toMatch(
      /purchase_batch_id = p_batch_id[\s\S]*split_generation = p_split_generation[\s\S]*status = 'pending_approval'/,
    );
    expect(helper).toMatch(
      /INSERT INTO public\.supplier_purchase_orders[\s\S]*purchase_requisition_id[\s\S]*purchase_batch_id/,
    );
    expect(helper).toMatch(
      /INSERT INTO public\.supplier_purchase_order_items[\s\S]*cost_category_id/,
    );
    expectOrdered(helper, [
      /INSERT INTO public\.supplier_purchase_order_items/,
      /GET DIAGNOSTICS v_inserted_item_count = ROW_COUNT/,
      /v_inserted_item_count <> v_item_count/,
      /SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE/,
    ]);
    expect(helper).not.toMatch(
      /convert_supplier_purchase_requisition_(?:unmanaged|commercial)|create_supplier_purchase_order_from_requisition/,
    );
    expect(helper).not.toMatch(/status = 'converted'/);
  });

  test("reviews with exact signature, replay-first locking, and self review", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expect(review).toMatch(
      /p_batch_id uuid,[\s\S]*p_tenant_id uuid,[\s\S]*p_expected_version integer,[\s\S]*p_action text,[\s\S]*p_remark text,[\s\S]*p_can_override_budget boolean,[\s\S]*p_actor_user_id uuid,[\s\S]*p_actor_employee_id uuid,[\s\S]*p_idempotency_key text/,
    );
    expect(review).toMatch(/p_can_override_budget IS NULL/);
    expect(review).toMatch(
      /v_reviewed_at timestamptz := statement_timestamp\(\)/,
    );
    expect(review).toMatch(/p_action NOT IN \('approve', 'reject'\)/);
    expect(review).toMatch(
      /p_action = 'reject'[\s\S]*btrim\(p_remark\)[\s\S]*char_length\(btrim\(p_remark\)\) > 500/,
    );
    expectOrdered(review, [
      /v_request := jsonb_build_object/,
      /supplier-purchase-batch-command:/,
      /FROM public\.supplier_purchase_batch_command_events[\s\S]*?FOR UPDATE/,
      /supplier-purchase-batch-id:/,
      /FROM public\.supplier_purchase_batches[\s\S]*?FOR UPDATE/,
      /created_by_employee_id = p_actor_employee_id/,
    ]);
    for (const code of [
      "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
      "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT",
      "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
    ]) expect(review).toContain(code);
  });

  test("uses one canonical lock order before either review mutation", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expectOrdered(review, [
      /FROM public\.supplier_purchase_batches[\s\S]*?FOR UPDATE/,
      /FROM public\.tenant_suppliers[\s\S]*?FOR UPDATE/,
      /supplier-price-publish:/,
      /current_prices AS MATERIALIZED/,
      /lock_project_cost_budget_scope/,
      /FROM public\.finance_cost_categories[\s\S]*?FOR UPDATE/,
      /FROM public\.project_cost_budgets[\s\S]*?FOR UPDATE/,
      /FROM public\.project_cost_commitments[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_purchase_requisitions[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_purchase_orders[\s\S]*?FOR UPDATE/,
      /IF p_action = 'reject'/,
    ]);
  });

  test("rejects unless current commitments exactly match frozen budget facts", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expect(review).toMatch(
      /FROM public\.project_cost_commitments AS commitment[\s\S]*?commitment\.project_id = v_batch\.project_id[\s\S]*?OR commitment\.source_id IN \([\s\S]*?purchase_batch_id = p_batch_id[\s\S]*?split_generation = v_batch\.split_generation[\s\S]*?FOR UPDATE/,
    );
    expectOrdered(review, [
      /expected_commitments AS MATERIALIZED/,
      /commitment\.recognized_amount = 0/,
      /actual_commitment_count/,
      /IF p_action = 'reject'/,
      /IF NOT COALESCE\(v_commitments_match, false\) THEN/,
      /SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT/,
      /UPDATE public\.project_cost_commitments[\s\S]*?status = 'released'/,
      /UPDATE public\.supplier_purchase_requisitions[\s\S]*?status = 'rejected'/,
      /UPDATE public\.supplier_purchase_batches[\s\S]*?status = 'rejected'/,
      /record_supplier_purchase_batch_command_result/,
    ]);
    expect(review).toMatch(
      /split_generation = v_batch\.split_generation[\s\S]*status = 'pending_approval'/,
    );
    for (const fact of [
      "tenant_id", "project_id", "cost_category_id", "source_type",
      "source_id", "status", "amount", "budget_amount_snapshot",
      "expense_amount_snapshot", "other_commitment_amount_snapshot",
      "available_amount_snapshot",
    ]) expect(review, `missing commitment fact ${fact}`).toContain(fact);
  });

  test("validates every approval fact before the first order write", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expectOrdered(review, [
      /FROM public\.tenant_suppliers[\s\S]*?ORDER BY relationship\.id[\s\S]*?FOR UPDATE/,
      /get_tenant_supplier_order_eligibility_set/,
      /supplier-price-publish:/,
      /current_prices AS MATERIALIZED/,
      /child_headers_match/,
      /child_items_match/,
      /current_budget AS MATERIALIZED/,
      /v_budget_snapshot IS DISTINCT FROM v_batch\.budget_snapshot/,
      /convert_supplier_purchase_requisition_for_batch/,
    ]);
    expect(review).toMatch(/candidate_count = 1/);
    expect(review).toMatch(/price_item\.tenant_id = p_tenant_id/);
    expect(review).toMatch(/price_list\.tenant_supplier_id/);
    expect(review).toMatch(/source_id NOT IN[\s\S]*current_generation_children/);
    expect(review).toMatch(
      /expected_commitments AS MATERIALIZED[\s\S]*?commitments_match/,
    );
    expect(review).toMatch(
      /v_batch\.budget_status = 'over_budget'[\s\S]*NOT p_can_override_budget[\s\S]*SUPPLIER_PURCHASE_BATCH_BUDGET_OVERRIDE_REQUIRED/,
    );
  });

  test("appends every item blocker reason in stable evaluation order", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    const reasons = [
      "COST_CATEGORY_CHANGED",
      "CHILD_FROZEN_FACTS_CHANGED",
      "BUDGET_COMMITMENT_CHANGED",
    ] as const;
    let previousReason = -1;
    for (const reason of reasons) {
      const reasonAt = review.indexOf(`'reason', '${reason}'`);
      const selectAt = review.lastIndexOf("SELECT ", reasonAt);
      const intoAt = review.indexOf("INTO v_item_blockers", reasonAt);
      const assignment = review.slice(selectAt, intoAt);
      expect(reasonAt, `missing ${reason}`).toBeGreaterThan(previousReason);
      expect(assignment, `${reason} must append`).toStartWith(
        "SELECT v_item_blockers || COALESCE",
      );
      previousReason = reasonAt;
    }
  });

  test("persists revision-required state and never raises that outcome", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expectOrdered(review, [
      /IF v_requires_revision THEN/,
      /UPDATE public\.project_cost_commitments[\s\S]*?status = 'released'/,
      /UPDATE public\.supplier_purchase_requisitions[\s\S]*?status = 'draft'/,
      /submitted_by_employee_id = NULL[\s\S]*?reviewed_by_employee_id = NULL[\s\S]*?purchase_order_id = NULL/,
      /UPDATE public\.supplier_purchase_batches[\s\S]*?status = 'draft'/,
      /budget_status = 'unchecked'[\s\S]*?budget_snapshot = '\{\}'::jsonb/,
      /'status', 'revision_required'/,
      /record_supplier_purchase_batch_command_result/,
      /RETURN v_result/,
    ]);
    const revision = review.slice(
      review.indexOf("IF v_requires_revision THEN"),
      review.indexOf("END IF;", review.indexOf("IF v_requires_revision THEN")) + 7,
    );
    expect(revision).not.toMatch(/RAISE EXCEPTION/);
    expect(review.slice(0, review.indexOf("IF v_requires_revision THEN")))
      .not.toMatch(/INSERT INTO public\.supplier_purchase_orders/);
    expect(review).toMatch(
      /v_blockers := v_supplier_blockers \|\| v_price_blockers \|\|[\s\S]*?v_item_blockers \|\| v_budget_blockers/,
    );
  });

  test("submits all drafts before converting children and ordering batch", () => {
    const review = extractFunction("review_supplier_purchase_batch");
    expectOrdered(review, [
      /ORDER BY requisition\.tenant_supplier_id, requisition\.id/,
      /gen_random_uuid\(\)/,
      /convert_supplier_purchase_requisition_for_batch/,
      /submit_supplier_purchase_order/,
      /'supplier-batch-order:' \|\| v_order_id::text/,
      /IF v_order_result ->> 'status' IS DISTINCT FROM 'submitted'/,
      /RAISE EXCEPTION/,
      /UPDATE public\.supplier_purchase_requisitions[\s\S]*?status = 'converted'/,
      /UPDATE public\.project_cost_commitments[\s\S]*?status = 'converted'/,
      /UPDATE public\.supplier_purchase_batches[\s\S]*?status = 'ordered'/,
    ]);
    expect(review).toMatch(/v_order_result -> 'purchase_order' ->> 'id'/);
    expect(review).toMatch(
      /\(v_order_result ->> 'version'\)::integer IS DISTINCT FROM 2/,
    );
    expect(review).toMatch(/count\(DISTINCT purchase_order_id\)/i);
  });
});
