import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const commandSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260826142000_create_supplier_purchase_batch_commands.sql",
  import.meta.url,
), "utf8");
const preflightSql = readFileSync(new URL(
  "../../../../supabase/migrations/20260826141500_prepare_supplier_purchase_batch_catalog_search.sql",
  import.meta.url,
), "utf8");
const design = readFileSync(new URL(
  "../../../../docs/superpowers/specs/2026-08-26-miniprogram-supplier-procurement-batch-design.md",
  import.meta.url,
), "utf8");

function extractFunction(name: string) {
  const start = commandSql.search(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\s*\\(`,
  ));
  if (start < 0) return "";
  const end = commandSql.indexOf("\n$$;", start);
  return end < 0 ? commandSql.slice(start) : commandSql.slice(start, end + 4);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expectOrdered(source: string, contracts: readonly RegExp[]) {
  let cursor = 0;
  for (const contract of contracts) {
    const match = source.slice(cursor).match(contract);
    expect(match, `missing ordered contract ${contract}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

const commands = [
  "resolve_supplier_purchase_batch_catalog",
  "save_supplier_purchase_batch_draft",
  "submit_supplier_purchase_batch",
  "cancel_supplier_purchase_batch",
] as const;
const commandSignatures = {
  resolve_supplier_purchase_batch_catalog:
    "uuid, uuid, text, uuid, uuid, uuid, timestamptz, integer, integer",
  save_supplier_purchase_batch_draft:
    "uuid, uuid, uuid, integer, text, date, text, jsonb, uuid, uuid, text",
  submit_supplier_purchase_batch:
    "uuid, uuid, integer, uuid, uuid, text",
  cancel_supplier_purchase_batch:
    "uuid, uuid, integer, text, uuid, uuid, text",
} as const;

function hasExactServiceRoleAcl(
  source: string,
  name: string,
  signature: string,
): boolean {
  const normalized = compact(source);
  return normalized.includes(
    `REVOKE ALL ON FUNCTION public.${name}( ${signature} ) ` +
      "FROM PUBLIC, anon, authenticated, service_role; " +
      `GRANT EXECUTE ON FUNCTION public.${name}( ${signature} ) ` +
      "TO service_role;",
  );
}

function hasLocalVersionZeroOutcome(source: string, code: string): boolean {
  const codeAt = source.lastIndexOf(`'error_code', '${code}'`);
  if (codeAt < 0) return false;
  const returnAt = source.lastIndexOf(
    "RETURN public.record_supplier_purchase_batch_command_result(",
    codeAt,
  );
  if (returnAt < 0) return false;
  const tail = source.slice(returnAt);
  const closingLine = tail.match(/\n\s*\);/)?.index;
  if (closingLine === undefined) return false;
  const closeAt = tail.indexOf(");", closingLine);
  if (closeAt < 0) return false;
  const outcome = compact(tail.slice(0, closeAt + 2));
  const codeInOutcome = outcome.indexOf(`'error_code', '${code}'`);
  if (codeInOutcome < 0 || !outcome.includes(", 'save_draft',")) return false;
  const suffix = outcome.slice(codeInOutcome);
  return /'version', (?:0|CASE WHEN .* ELSE 0 END)\), (?:0|CASE WHEN .* ELSE 0 END) \);$/.test(
    suffix,
  );
}

describe("supplier purchase batch command migrations", () => {
  test("ACL matcher rejects a wrong overload despite an exact signature elsewhere", () => {
    const name = "submit_supplier_purchase_batch";
    const signature = commandSignatures[name];
    const normalized = compact(commandSql);
    const poisoned = normalized.replace(
      `REVOKE ALL ON FUNCTION public.${name}( ${signature} )`,
      `REVOKE ALL ON FUNCTION public.${name}( text )`,
    );
    expect(hasExactServiceRoleAcl(poisoned, name, signature)).toBe(false);
  });

  test("version-zero matcher rejects an unrecorded result plus unrelated recorder", () => {
    const poisoned = "RETURN jsonb_build_object('error_code', " +
      "'SUPPLIER_PURCHASE_BATCH_ID_CONFLICT', 'version', 0); " +
      "-- unrelated record_supplier_purchase_batch_command_result";
    expect(hasLocalVersionZeroOutcome(
      poisoned,
      "SUPPLIER_PURCHASE_BATCH_ID_CONFLICT",
    )).toBe(false);
  });

  test("builds catalog trigram indexes concurrently outside a transaction", () => {
    expect(preflightSql).not.toMatch(/\bBEGIN\s*;/i);
    expect(preflightSql).not.toMatch(/\bCOMMIT\s*;/i);
    expect(preflightSql).toMatch(/cannot run inside a[\s\S]*transaction/i);
    expect(preflightSql).toMatch(/invalid index[\s\S]*retry/i);
    for (const [table, column] of [
      ["supplier_products", "product_code"],
      ["supplier_products", "name"],
      ["supplier_skus", "sku_code"],
      ["supplier_skus", "name"],
    ]) {
      expect(preflightSql).toMatch(new RegExp(
        `CREATE INDEX CONCURRENTLY[\\s\\S]*ON public\\.${table}[\\s\\S]*${column} extensions\\.gin_trgm_ops`,
      ));
    }
  });

  test("exposes four service-role-only fixed-path RPCs", () => {
    for (const name of commands) {
      const fn = extractFunction(name);
      expect(fn).not.toBe("");
      expect(fn).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
      expect(hasExactServiceRoleAcl(
        commandSql,
        name,
        commandSignatures[name],
      )).toBe(true);
    }
  });

  test("keeps catalog bounded, stable, set-based, and fail-closed", () => {
    const fn = extractFunction("resolve_supplier_purchase_batch_catalog");
    expect(fn).toMatch(/p_page_size integer DEFAULT 20/);
    expect(fn).toMatch(/p_page_size NOT BETWEEN 1 AND 100/);
    expect(fn).toMatch(/p_page IS NULL[\s\S]*p_page_size IS NULL/);
    expect(fn).toMatch(/v_offset bigint/);
    expect(fn).toMatch(/\(p_page::bigint - 1\) \* p_page_size::bigint/);
    expect(fn).toContain(String.raw`v_keyword_pattern, '\', '\\'), '%', '\%'), '_', '\_')`);
    expect(fn).toContain(String.raw`ILIKE v_keyword_pattern ESCAPE '\'`);
    expect(fn).not.toMatch(/ILIKE '%' \|\| btrim\(p_keyword\)/);
    expect(fn).toMatch(/price_candidates AS MATERIALIZED/);
    expect(fn).toMatch(/COUNT\(\*\) OVER \(\s*PARTITION BY[\s\S]*candidate_count/);
    expect(fn).toMatch(/candidate_count = 1/);
    expect(fn).toMatch(/ORDER BY[\s\S]*product_name[\s\S]*supplier_sku_id/);
    expect(fn).toMatch(/LIMIT p_page_size[\s\S]*OFFSET/);
  });

  test("validates save input before locks and resolves immutable facts once", () => {
    const fn = extractFunction("save_supplier_purchase_batch_draft");
    expect(fn).toMatch(/p_project_id uuid[\s\S]*p_items jsonb/);
    expect(fn).toMatch(/jsonb_typeof\(p_items\) <> 'array'/);
    expect(fn).toMatch(/jsonb_array_length\(p_items\) NOT BETWEEN 1 AND 100/);
    expectOrdered(fn, [
      /IF p_items IS NULL OR jsonb_typeof\(p_items\) <> 'array'/,
      /IF jsonb_array_length\(p_items\) NOT BETWEEN 1 AND 100/,
    ]);
    expect(fn).toMatch(/jsonb_object_keys[\s\S]*supplier_sku_id[\s\S]*cost_category_id[\s\S]*quantity/);
    expect(fn).toMatch(/jsonb_typeof\(item\.value -> 'quantity'\) <> 'string'/);
    expectOrdered(fn, [
      /jsonb_typeof\(p_items\)/,
      /assert_supplier_purchase_order_actor/,
      /supplier-purchase-batch-command:/,
      /supplier-purchase-batch-id:/,
      /FROM public\.supplier_purchase_batches[\s\S]*FOR UPDATE/,
    ]);
    expect(fn).toMatch(/requested_items AS MATERIALIZED/);
    expect(fn).toMatch(/price_candidates AS MATERIALIZED/);
    expect(fn).toMatch(/candidate_count = 1/);
    expect(fn).toMatch(/COUNT\(DISTINCT tenant_supplier_id\)[\s\S]*> 20/);
    expect(fn.match(/FROM public\.supplier_price_list_items/g)?.length).toBe(1);
    expect(fn).toMatch(/INSERT INTO public\.supplier_purchase_batch_items/);
  });

  test("fingerprints actor and request in the exact event key domain", () => {
    for (const name of commands.slice(1)) {
      const fn = extractFunction(name);
      expect(fn).toMatch(/v_request := jsonb_build_object/);
      expect(fn).toMatch(/'actor_user_id', p_actor_user_id/);
      expect(fn).toMatch(/'actor_employee_id', p_actor_employee_id/);
      expect(fn).toContain("extensions.digest(");
      expect(fn).toContain("convert_to(v_request::text, 'UTF8')");
      expect(fn).toContain("'sha256'");
      expect(fn).toMatch(/supplier-purchase-batch-command:[\s\S]*p_tenant_id[\s\S]*p_batch_id[\s\S]*p_idempotency_key/);
      expect(fn).toMatch(/SUPPLIER_IDEMPOTENCY_CONFLICT/);
      expect(fn).toMatch(/'idempotent', true/);
    }
  });

  test("submits with one whole-batch budget pass and supplier-grouped children", () => {
    const fn = extractFunction("submit_supplier_purchase_batch");
    expectOrdered(fn, [
      /FROM public\.supplier_purchase_batches[\s\S]*?FOR UPDATE/,
      /FROM public\.tenant_suppliers[\s\S]*?ORDER BY[\s\S]*?FOR UPDATE OF relationship/,
      /supplier-price-publish:/,
      /lock_project_cost_budget_scope/,
      /FROM public\.finance_cost_categories[\s\S]*?ORDER BY[\s\S]*?FOR UPDATE/,
      /INSERT INTO public\.supplier_purchase_requisitions/,
    ]);
    expect(fn).toMatch(/requested_by_category AS MATERIALIZED/);
    expect(fn).toMatch(/source_id NOT IN[\s\S]*split_generation/);
    expect(fn).toMatch(/jsonb_object_agg[\s\S]*budget_amount[\s\S]*::text/);
    expect(fn).toMatch(/PARTITION BY batch_item\.tenant_supplier_id/);
    expect(fn).toMatch(/INSERT INTO public\.project_cost_commitments[\s\S]*purchase_requisition_id/);
    expect(fn).toMatch(/status = 'pending_approval'/);
    expect(fn).toMatch(/FOR v_supplier_id IN[\s\S]*ORDER BY item\.supplier_id[\s\S]*LOOP[\s\S]*pg_advisory_xact_lock/);
    expect(fn).toMatch(/JOIN public\.tenant_suppliers AS relationship[\s\S]*relationship\.tenant_id = p_tenant_id[\s\S]*relationship\.supplier_id[\s\S]*relationship\.default_currency = 'CNY'/);
    expect(fn).toMatch(/v_locked_relationship_count <> v_batch\.supplier_count/);
    expect(fn).toMatch(/v_current_price_count <> v_batch\.item_count/);
  });

  test("cancels current children and refuses consumed financial facts", () => {
    const fn = extractFunction("cancel_supplier_purchase_batch");
    expect(fn).toMatch(/status NOT IN \('draft', 'pending_approval'\)/);
    expect(fn).toMatch(/status IN \('converted', 'consumed'\)/);
    expect(fn).toMatch(/SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT/);
    expectOrdered(fn, [
      /FROM public\.supplier_purchase_requisitions[\s\S]*?split_generation[\s\S]*?FOR UPDATE/,
      /UPDATE public\.project_cost_commitments[\s\S]*?status = 'released'/,
      /UPDATE public\.supplier_purchase_requisitions[\s\S]*?status = 'cancelled'/,
      /UPDATE public\.supplier_purchase_batches AS batch SET status = 'cancelled'/,
    ]);
  });

  test("validates exact JSON shape and bounded decimal text before any cast", () => {
    const save = extractFunction("save_supplier_purchase_batch_draft");
    const objectGuard = save.indexOf("jsonb_typeof(item.value) <> 'object'");
    const keysGuard = save.indexOf("jsonb_object_keys(item.value)");
    const recordCast = save.indexOf("jsonb_to_recordset(p_items)");
    expect(objectGuard).toBeGreaterThan(0);
    expect(keysGuard).toBeGreaterThan(objectGuard);
    expect(recordCast).toBeGreaterThan(keysGuard);
    expect(save).toMatch(/item\.value \?& ARRAY\[[^\]]*supplier_sku_id[^\]]*cost_category_id[^\]]*quantity/);
    expect(save).toMatch(/item\.value ->> 'quantity'[\s\S]*\^/);
    expect(save).toMatch(/numeric\(18,\s*4\)/);
    expect(save).toMatch(/quantity > 0[\s\S]*scale\(item\.quantity\) <= 4/);
    expect(save).toMatch(/lower\(item\.supplier_sku_id::text\)[\s\S]*HAVING COUNT\(\*\) > 1/);
    expect(save.indexOf("assert_supplier_purchase_order_actor")).toBeGreaterThan(recordCast);
  });

  test("uses a complete tenant-owned active catalog chain", () => {
    for (const name of [
      "resolve_supplier_purchase_batch_catalog",
      "save_supplier_purchase_batch_draft",
      "submit_supplier_purchase_batch",
    ]) {
      const fn = extractFunction(name);
      for (const contract of [
        /price_list\.tenant_id = p_tenant_id/,
        /price_item\.tenant_id = p_tenant_id/,
        /price_list\.tenant_supplier_id/,
        /relationship\.tenant_id/,
        /relationship\.supplier_id/,
        /get_tenant_supplier_order_eligibility_set/,
        /price_list\.lifecycle_status = 'published'/,
        /price_list\.scope_type = 'default'/,
        /price_list\.currency = 'CNY'/,
        /product\.status = 'active'/,
        /sku\.status = 'active'/,
        /product\.id = price_item\.supplier_product_id/,
        /category\.status = 'active'/,
        /brand\.status = 'active'/,
        /purchase_unit\.status = 'active'/,
        /base_unit\.status = 'active'/,
        /sku\.purchase_unit_id = price_item\.purchase_unit_id/,
        /sku\.base_unit_id = price_item\.base_unit_id/,
        /sku\.base_unit_conversion = price_item\.base_unit_conversion/,
        /supplier\.ownership_scope = 'platform'[\s\S]*supplier\.owner_tenant_id = p_tenant_id/,
        /product\.ownership_scope = sku\.ownership_scope/,
        /product\.owner_tenant_id IS NOT DISTINCT FROM sku\.owner_tenant_id/,
        /category\.ownership_scope = 'platform'[\s\S]*category\.owner_tenant_id = p_tenant_id/,
        /brand\.ownership_scope = 'platform'[\s\S]*brand\.owner_tenant_id = p_tenant_id/,
      ]) expect(fn, `${name} missing ${contract}`).toMatch(contract);
    }
  });

  test("counts price candidates per tenant supplier and SKU without arbitrary choice", () => {
    for (const name of [
      "resolve_supplier_purchase_batch_catalog",
      "save_supplier_purchase_batch_draft",
    ]) {
      const fn = extractFunction(name);
      expect(fn).toMatch(/COUNT\(\*\) OVER \(\s*PARTITION BY[\s\S]*?(?:relationship\.id|tenant_supplier_id)[\s\S]*?(?:sku\.id|supplier_sku_id)/);
      expect(fn).toMatch(/candidate_count = 1/);
      expect(fn.indexOf("candidate_count = 1")).toBeGreaterThan(
        fn.indexOf("COUNT(*) OVER"),
      );
    }
    const submit = extractFunction("submit_supplier_purchase_batch");
    expect(submit).toMatch(/COUNT\(\*\) OVER \(\s*PARTITION BY locked\.tenant_supplier_id, locked\.frozen_supplier_sku_id/);
    expect(submit).toMatch(/candidate_count = 1/);
  });

  test("revalidates every frozen fact and materializes exactly one child per supplier", () => {
    const submit = extractFunction("submit_supplier_purchase_batch");
    for (const field of [
      "supplier_price_list_item_id", "supplier_price_list_id",
      "supplier_product_id", "unit_price", "tax_rate", "tax_inclusive",
      "purchase_unit_id", "base_unit_id", "base_unit_conversion",
      "price_list_code_snapshot", "price_list_version_snapshot",
      "price_effective_from_snapshot", "price_effective_until_snapshot",
      "product_code_snapshot", "product_name_snapshot",
      "catalog_category_id", "category_name_snapshot", "brand_id",
      "brand_name_snapshot", "sku_code_snapshot", "sku_name_snapshot",
      "specification_snapshot", "model_snapshot",
      "purchase_unit_code_snapshot", "purchase_unit_name_snapshot",
      "purchase_unit_symbol_snapshot", "base_unit_code_snapshot",
      "base_unit_name_snapshot", "base_unit_symbol_snapshot",
      "supplier_name_snapshot", "line_subtotal_amount",
      "line_tax_amount", "line_total_amount",
    ]) expect(submit, `missing frozen comparison ${field}`).toContain(field);
    expect(submit).toMatch(/GROUP BY item\.tenant_supplier_id, item\.supplier_id/);
    expect(submit).toMatch(/INSERT INTO public\.supplier_purchase_requisitions/);
    expect(submit).toMatch(/INSERT INTO public\.supplier_purchase_requisition_items/);
    expect(submit).toMatch(/PARTITION BY batch_item\.tenant_supplier_id/);
    const currentPricePass = submit.slice(
      submit.indexOf("locked_current_candidates AS MATERIALIZED"),
      submit.indexOf("lock_project_cost_budget_scope"),
    );
    expect(currentPricePass).not.toMatch(
      /END::numeric\(18,\s*2\) AS line_(?:subtotal|tax|total)_amount/,
    );
  });

  test("captures one budget snapshot and allocates commitments by child/category", () => {
    const submit = extractFunction("submit_supplier_purchase_batch");
    expect((submit.match(/lock_project_cost_budget_scope/g) ?? []).length).toBe(1);
    expect(submit).toMatch(/requested_by_category AS MATERIALIZED[\s\S]*GROUP BY batch_item\.cost_category_id/);
    expect(submit).toMatch(/FROM public\.project_cost_events/);
    expect(submit).not.toMatch(/FROM public\.finance_ledger_entries/);
    expect(submit).toMatch(/commitment\.status IN \('reserved', 'converted'\)/);
    expect(submit).toMatch(/commitment\.amount - commitment\.recognized_amount/);
    expect(submit).toMatch(/current_generation_children AS MATERIALIZED/);
    expect(submit).toMatch(/commitment\.source_id NOT IN \(SELECT id FROM current_generation_children\)/);
    expect(submit).toMatch(/jsonb_object_agg[\s\S]*requested_amount[\s\S]*::text[\s\S]*available_amount[\s\S]*::text/);
    expect(submit).toMatch(/child_by_category AS MATERIALIZED[\s\S]*GROUP BY requisition\.id, item\.cost_category_id/);
    expect(submit).toMatch(/child\.purchase_requisition_id/);
  });

  test("orders replay checks before resource state and persists only final results", () => {
    for (const name of [
      "save_supplier_purchase_batch_draft",
      "submit_supplier_purchase_batch",
      "cancel_supplier_purchase_batch",
    ]) {
      const fn = extractFunction(name);
      expectOrdered(fn, [
        /v_request := jsonb_build_object/,
        /v_fingerprint := encode/,
        /supplier-purchase-batch-command:/,
        /FROM public\.supplier_purchase_batch_command_events[\s\S]*?FOR UPDATE/,
        /supplier-purchase-batch-id:/,
        /FROM public\.supplier_purchase_batches[\s\S]*?FOR UPDATE/,
        /INSERT INTO public\.supplier_purchase_batch_command_events/,
      ]);
    }
  });

  test("persists every post-lock business outcome including version-zero misses", () => {
    for (const name of [
      "save_supplier_purchase_batch_draft",
      "submit_supplier_purchase_batch",
      "cancel_supplier_purchase_batch",
    ]) {
      const fn = extractFunction(name);
      expect(fn).toMatch(/'status', 'not_found'[\s\S]*'version', 0/);
    }
    const save = extractFunction("save_supplier_purchase_batch_draft");
    for (const code of [
      "SUPPLIER_PURCHASE_BATCH_ID_CONFLICT",
      "SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID",
      "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      "SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED",
    ]) {
      expect(hasLocalVersionZeroOutcome(save, code), code).toBe(true);
    }
    const recorder = extractFunction(
      "record_supplier_purchase_batch_command_result",
    );
    expect(recorder).toMatch(/INSERT INTO public\.supplier_purchase_batch_command_events/);
    expect(recorder).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
    expect(commandSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.record_supplier_purchase_batch_command_result\([\s\S]*service_role/,
    );
  });

  test("cancel guards orders and financial consumption before current-generation release", () => {
    const cancel = extractFunction("cancel_supplier_purchase_batch");
    expect(cancel).toMatch(/purchase_order_id IS NOT NULL/);
    expectOrdered(cancel, [
      /split_generation = v_batch\.split_generation[\s\S]*?FOR UPDATE/,
      /status IN \('converted', 'consumed'\)/,
      /UPDATE public\.project_cost_commitments[\s\S]*?status = 'released'/,
    ]);
    expect(cancel).toMatch(/commitment\.status = 'reserved'/);
  });

  test("serializes numeric snapshots and uses one captured command time", () => {
    const snapshot = extractFunction("supplier_purchase_batch_to_jsonb");
    for (const field of ["subtotal_amount", "tax_amount", "total_amount"]) {
      expect(snapshot).toMatch(new RegExp(`'${field}', p_batch\\.${field}::text`));
    }
    const save = extractFunction("save_supplier_purchase_batch_draft");
    expect((save.match(/v_priced_at := clock_timestamp\(\)/g) ?? []).length).toBe(1);
    expect(save).toMatch(/priced_at, subtotal_amount, tax_amount, total_amount/);
    expect(save).toMatch(/supplier_count, item_count/);
    expect(save).toMatch(/version = batch\.version \+ 1/);
    expect(save).toMatch(/round\(round\(candidate\.quantity \* candidate\.unit_price, 2\)/);
  });

  test("persists strict previews, price-change details, and explicit idempotency", () => {
    const save = extractFunction("save_supplier_purchase_batch_draft");
    expect(save).toMatch(/jsonb_agg\([\s\S]*tenant_supplier_id[\s\S]*supplier_name[\s\S]*item_count[\s\S]*subtotal_amount[\s\S]*tax_amount[\s\S]*total_amount[\s\S]*ORDER BY[\s\S]*tenant_supplier_id/);
    expect(save).toMatch(/'split_preview', v_split_preview/);
    const submit = extractFunction("submit_supplier_purchase_batch");
    for (const field of [
      "supplier_sku_id", "product_name", "sku_name", "frozen_unit_price",
      "current_unit_price", "frozen_price_version", "current_price_version",
    ]) expect(submit).toMatch(new RegExp(`'${field}'`));
    expect(submit).toMatch(/'details', v_price_change_details/);
    for (const fn of commands.slice(1).map(extractFunction)) {
      expect(fn).toMatch(/'status', 'validation_error'[\s\S]*'idempotent', false/);
    }
  });

  test("re-establishes idempotency and batch locks after overflow rollback", () => {
    const save = extractFunction("save_supplier_purchase_batch_draft");
    const handler = save.slice(save.lastIndexOf(
      "EXCEPTION WHEN numeric_value_out_of_range",
    ));
    expectOrdered(handler, [
      /supplier-purchase-batch-command:/,
      /FROM public\.supplier_purchase_batch_command_events[\s\S]*?FOR UPDATE/,
      /supplier-purchase-batch-id:/,
      /FROM public\.supplier_purchase_batches[\s\S]*?FOR UPDATE/,
      /record_supplier_purchase_batch_command_result/,
    ]);
  });

  test("documents and implements complete first-result replay semantics", () => {
    expect(design).toMatch(/通过结构[、/]身份校验并进入命令域后的首次业务结果/);
    expect(design).toMatch(/version\s*0/);
    expect(commandSql).toMatch(/result_version[\s\S]*0/);
  });
});
