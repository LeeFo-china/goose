import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

function expectOrdered(value: string, patterns: readonly RegExp[]): void {
  let cursor = 0;

  for (const pattern of patterns) {
    const match = value.slice(cursor).match(pattern);
    expect(match, `missing ordered contract ${pattern}`).not.toBeNull();
    cursor += (match?.index ?? 0) + (match?.[0].length ?? 0);
  }
}

describe("supplier purchasable SKU atomic command migration", () => {
  const readContext = extractFunction(
    "get_supplier_purchasable_sku_price_context_v1",
  );
  const command = extractFunction("command_supplier_purchasable_sku_v1");
  const normalizedReadContext = compact(readContext);
  const normalizedCommand = compact(command);
  const normalizedSql = compact(sql);

  test("creates both exact service-role-only functions in a bounded migration", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(
      /^-- Rollback: keep the migration applied while any API revision calls these v1 functions;/,
    );
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);

    expect(normalizedReadContext).toContain(
      "p_tenant_id uuid, p_tenant_supplier_id uuid, p_supplier_id uuid, p_supplier_product_id uuid, p_supplier_sku_id uuid",
    );
    expect(normalizedCommand).toContain(
      "p_action text, p_tenant_id uuid, p_tenant_supplier_id uuid, p_supplier_id uuid, p_supplier_product_id uuid, p_supplier_sku_id uuid, p_expected_sku_version integer, p_sku jsonb, p_price jsonb, p_expected_price_list_id uuid, p_expected_price_list_version integer, p_actor_user_id uuid, p_actor_employee_id uuid, p_idempotency_key text",
    );

    for (const fn of [readContext, command]) {
      expect(fn).toContain("RETURNS jsonb");
      expect(fn).toContain("LANGUAGE plpgsql");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public");
    }

    expect(normalizedSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_supplier_purchasable_sku_price_context_v1\( uuid, uuid, uuid, uuid, uuid \) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(normalizedSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_supplier_purchasable_sku_price_context_v1\( uuid, uuid, uuid, uuid, uuid \) TO service_role;/,
    );
    expect(normalizedSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.command_supplier_purchasable_sku_v1\( text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb, uuid, integer, uuid, uuid, text \) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(normalizedSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.command_supplier_purchasable_sku_v1\( text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb, uuid, integer, uuid, uuid, text \) TO service_role;/,
    );
  });

  test("reads target-SKU current and future price context without global period conflicts", () => {
    expectOrdered(readContext, [
      /p_tenant_id IS NULL[\s\S]*p_supplier_product_id IS NULL/,
      /v_priced_at := pg_catalog\.transaction_timestamp\(\)/,
      /FROM public\.tenant_suppliers AS relationship/,
      /FROM public\.supplier_products AS product/,
      /FROM public\.supplier_skus AS sku/,
      /price_list\.effective_from <= v_priced_at/,
      /price_list\.effective_until IS NULL[\s\S]*?price_list\.effective_until > v_priced_at/,
      /price_list\.effective_from > v_priced_at/,
      /RETURN jsonb_build_object/,
    ]);
    expect(normalizedReadContext).toContain(
      "relationship.relationship_status = 'active'",
    );
    expect(normalizedReadContext).toContain(
      "product.ownership_scope = 'tenant' AND product.owner_tenant_id = p_tenant_id",
    );
    expect(normalizedReadContext).toContain(
      "sku.supplier_product_id = p_supplier_product_id",
    );
    expect(normalizedReadContext).toContain(
      "sku.ownership_scope = 'tenant' AND sku.owner_tenant_id = p_tenant_id",
    );
    expect(normalizedReadContext).toContain(
      "upper(btrim(price_list.price_list_code)) = 'DEFAULT'",
    );
    expect(normalizedReadContext).toContain("price_list.currency = 'CNY'");
    expect(normalizedReadContext).toContain(
      "price_list.lifecycle_status = 'published'",
    );
    expect(normalizedReadContext).toMatch(
      /FROM public\.supplier_price_lists AS price_list JOIN public\.supplier_price_list_items AS item ON item\.supplier_price_list_id = price_list\.id[\s\S]*item\.supplier_sku_id = p_supplier_sku_id/,
    );
    expect(normalizedReadContext).toMatch(
      /SELECT count\(\*\)[\s\S]*FROM public\.supplier_price_lists AS price_list JOIN public\.supplier_price_list_items AS item[\s\S]*item\.supplier_sku_id = p_supplier_sku_id[\s\S]*IF v_current_count > 1/,
    );
    expect(normalizedReadContext).toMatch(
      /'recommended_tax_rate',[\s\S]*COALESCE\([\s\S]*'0\.13'/,
    );
    expect(normalizedReadContext).toContain("'currency', 'CNY'");
    expect(normalizedReadContext).toContain(
      "'recommended_tax_inclusive', false",
    );
    expect(normalizedReadContext).toContain(
      "'next_scheduled_effective_from'",
    );
    expect(normalizedReadContext).toContain("'current_price'");
    expect(normalizedReadContext).toContain("'supplier_price_list_id'");
    expect(normalizedReadContext).toContain("'supplier_price_list_version'");
    expect(normalizedReadContext).toContain(
      "'supplier_price_list_row_version'",
    );
    expect(normalizedReadContext).toContain("'supplier_price_list_item_id'");
    expect(normalizedReadContext).toContain("'null'::jsonb");
    expect(normalizedReadContext).not.toContain("jsonb_agg");
  });

  test("validates and normalizes the complete request before the parent lock", () => {
    const parentLockAt = normalizedCommand.indexOf(
      "PERFORM pg_catalog.pg_advisory_xact_lock",
    );

    expect(parentLockAt).toBeGreaterThanOrEqual(0);
    expect(normalizedCommand).toContain(
      "p_action IS NULL OR p_action NOT IN ('create', 'update')",
    );
    expect(normalizedCommand.indexOf("jsonb_typeof(p_sku) <> 'object'"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand.indexOf("jsonb_typeof(p_price) <> 'object'"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand.indexOf("jsonb_object_keys(p_sku)"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand.indexOf("jsonb_object_keys(p_price)"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand.indexOf("SUPPLIER_SKU_STATE_CONFLICT"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand.indexOf("SUPPLIER_PRICE_LIST_VERSION_CONFLICT"))
      .toBeLessThan(parentLockAt);
    expect(normalizedCommand).toContain(
      "field.key NOT IN ( 'sku_code', 'name', 'specification', 'model', 'purchase_unit_id', 'batch_managed', 'color_managed', 'serial_managed', 'spec_values' )",
    );
    expect(normalizedCommand).toContain(
      "field.key NOT IN ('unit_price', 'tax_rate', 'tax_inclusive')",
    );
    expect(normalizedCommand).toContain(
      "v_effective_sku := (p_sku - 'sku_code') || jsonb_build_object( 'sku_code', 'TS-' || upper(replace(p_supplier_sku_id::text, '-', '')) )",
    );
    expect(normalizedCommand).toContain(
      "'^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$'",
    );
    expect(normalizedCommand).toContain(
      "'^(0(\\.[0-9]{1,6})?|1(\\.0{1,6})?)$'",
    );
    expect(normalizedCommand).toContain(
      "(p_expected_price_list_id IS NULL) <> (p_expected_price_list_version IS NULL)",
    );
    expect(normalizedCommand).toContain(
      "p_action = 'update' AND COALESCE(p_expected_sku_version, 0) < 1",
    );
    const updateUnitRejectionAt = normalizedCommand.indexOf(
      "p_action = 'update' AND (p_sku ? 'purchase_unit_id')",
    );
    expect(updateUnitRejectionAt).toBeGreaterThanOrEqual(0);
    expect(updateUnitRejectionAt).toBeLessThan(parentLockAt);
    expect(normalizedCommand).toMatch(
      /p_action = 'update'[\s\S]*p_sku \? 'purchase_unit_id'[\s\S]*'status', 'validation_error'[\s\S]*'reason', 'purchase_unit_update_not_allowed'/,
    );
    expect(normalizedCommand).toContain(
      "v_parent_key := 'supplier-purchasable-sku:' || pg_catalog.md5(btrim(p_idempotency_key))",
    );
    expect(normalizedCommand).toContain(
      "pg_catalog.hashtextextended(v_parent_key, 20260901130000)",
    );
  });

  test("replays only an exact normalized parent request", () => {
    expectOrdered(normalizedCommand, [
      /v_parent_request := jsonb_build_object/,
      /v_parent_fingerprint := pg_catalog\.md5\(v_parent_request::text\)/,
      /v_parent_key := 'supplier-purchasable-sku:'/,
      /pg_advisory_xact_lock/,
      /FROM public\.supplier_command_events AS event/,
      /event\.actor_user_id = p_actor_user_id/,
      /v_event\.tenant_id IS DISTINCT FROM p_tenant_id/,
      /v_event\.resource_type <> 'supplier_sku'/,
      /v_event\.resource_id <> p_supplier_sku_id/,
      /v_event\.command <> 'supplier_purchasable_sku_v1:' \|\| p_action/,
      /v_event\.from_state ->> '_fingerprint' IS DISTINCT FROM v_parent_fingerprint/,
      /v_event\.from_state -> '_request' IS DISTINCT FROM v_parent_request/,
      /MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT'/,
      /jsonb_set\( v_event\.to_state, '\{idempotent\}', 'true'::jsonb, true \)/,
    ]);
  });

  test("uses the cross-entry price lock order before product and SKU locks", () => {
    expectOrdered(command, [
      /pg_catalog\.hashtextextended\(v_parent_key, 20260901130000\)/,
      /FROM public\.employees AS employee[\s\S]*?FOR SHARE/,
      /FROM public\.tenant_suppliers AS relationship[\s\S]*?FOR UPDATE OF relationship[\s\S]*?FOR SHARE OF supplier/,
      /pg_advisory_xact_lock[\s\S]*?'supplier-price-publish:'/,
      /INTO v_source_price_list[\s\S]*?FROM public\.supplier_price_lists AS price_list[\s\S]*?FOR UPDATE OF price_list/,
      /pg_advisory_xact_lock[\s\S]*?'supplier-price-series:'/,
      /FROM public\.supplier_price_lists AS price_list[\s\S]*?JOIN public\.supplier_price_list_items AS item[\s\S]*?ORDER BY price_list\.version_number, price_list\.id[\s\S]*?FOR UPDATE OF price_list/,
      /FROM public\.supplier_products AS product[\s\S]*?FOR UPDATE/,
      /FROM public\.supplier_skus AS sku[\s\S]*?FOR UPDATE/,
      /command_supplier_sku_v3/,
      /INSERT INTO public\.supplier_price_list_items[\s\S]*?SELECT/,
      /command_supplier_price_item_v2/,
      /price-list-retire-source[\s\S]*?command_supplier_price_list_v2/,
      /price-list-publish[\s\S]*?command_supplier_price_list_v2/,
      /resolve_supplier_purchase_order_catalog/,
      /INSERT INTO public\.supplier_command_events/,
    ]);
    expect(normalizedCommand).toContain("command_supplier_product_v2(");
    expect(normalizedCommand).toContain("command_supplier_price_list_v2(");

    const remainingPriceRowLocks = normalizedCommand.match(
      /PERFORM price_list\.id FROM public\.supplier_price_lists AS price_list[\s\S]*?FOR UPDATE OF price_list;/g,
    ) ?? [];
    expect(remainingPriceRowLocks).toHaveLength(1);
    expect(remainingPriceRowLocks[0]).toContain(
      "JOIN public.supplier_price_list_items AS item",
    );
    expect(remainingPriceRowLocks[0]).toContain(
      "item.supplier_sku_id = p_supplier_sku_id",
    );
  });

  test("locks the supplier row and maps stable child context failures", () => {
    expect(normalizedCommand).toMatch(
      /FROM public\.tenant_suppliers AS relationship JOIN public\.suppliers AS supplier[\s\S]*FOR UPDATE OF relationship FOR SHARE OF supplier/,
    );
    expectOrdered(command, [
      /FROM public\.tenant_suppliers AS relationship[\s\S]*?FOR SHARE OF supplier/,
      /command_supplier_sku_v3/,
    ]);
    expect(normalizedCommand).toContain("'TENANT_SUPPLIER_NOT_FOUND'");
    expect(normalizedCommand).toMatch(
      /v_error_message IN \([\s\S]*'TENANT_SUPPLIER_NOT_FOUND'[\s\S]*\)[\s\S]*'error_code', v_error_message/,
    );
  });

  test("locks the required active purchase unit on create before any SKU write", () => {
    expectOrdered(command, [
      /FROM public\.supplier_skus AS sku[\s\S]*?FOR UPDATE/,
      /IF p_action = 'create' THEN/,
      /v_purchase_unit_id := \(p_sku ->> 'purchase_unit_id'\)::uuid/,
      /FROM public\.catalog_units AS unit_record/,
      /unit_record\.id = v_purchase_unit_id/,
      /unit_record\.status = 'active'/,
      /FOR SHARE/,
      /'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED'/,
      /'reason', 'purchase_unit_not_found'/,
      /command_supplier_sku_v3/,
    ]);

    const unitLockAt = normalizedCommand.indexOf(
      "FROM public.catalog_units AS unit_record",
    );
    const firstSkuWriteAt = normalizedCommand.indexOf(
      "public.command_supplier_sku_v3(",
    );

    expect(unitLockAt).toBeGreaterThanOrEqual(0);
    expect(unitLockAt).toBeLessThan(firstSkuWriteAt);
  });

  test("keeps unit conversion changes out of the composite update", () => {
    expect(normalizedCommand).toContain(
      "v_sku_payload := (v_effective_sku - 'sku_code') - 'purchase_unit_id'",
    );
    expect(normalizedCommand).not.toContain(
      "replace_supplier_sku_unit_conversions_v3",
    );
    expect(normalizedCommand).not.toContain(":sku-unit-conversions");
    expect(normalizedCommand).not.toContain("v_purchase_unit_changed");
    expect(normalizedCommand).not.toContain("p_edges => jsonb_build_array()");
    expect(normalizedCommand).not.toContain(
      "p_base_unit_id => v_purchase_unit_id",
    );
    const skuUpdateAt = normalizedCommand.indexOf(
      "v_child_key := v_parent_key || ':sku-update'",
    );
    const skuUpdateEnd = normalizedCommand.indexOf(
      ") INTO v_child_response",
      skuUpdateAt,
    );
    expect(skuUpdateAt).toBeGreaterThanOrEqual(0);
    expect(normalizedCommand.slice(skuUpdateAt, skuUpdateEnd)).not.toContain(
      "purchase_unit_id",
    );
  });

  test("enforces tenant-owned SKU lifecycle and exact optimistic concurrency", () => {
    expect(normalizedCommand).toContain(
      "product.ownership_scope = 'tenant' AND product.owner_tenant_id = p_tenant_id",
    );
    expect(normalizedCommand).toContain(
      "sku.ownership_scope = 'tenant' AND sku.owner_tenant_id = p_tenant_id",
    );
    expect(normalizedCommand).toContain("'SHARED_RESOURCE_READ_ONLY'");
    expect(normalizedCommand).toContain(
      "v_sku.version IS DISTINCT FROM p_expected_sku_version",
    );
    expect(normalizedCommand).toContain(
      "'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT'",
    );
    expect(normalizedCommand).toMatch(
      /v_sku\.status = 'inactive'[\s\S]*'SUPPLIER_SKU_STATE_CONFLICT'/,
    );
    expect(normalizedCommand).toContain("v_sku.status = 'draft'");
    expect(normalizedCommand).toMatch(
      /IF v_sku_fields_changed THEN[\s\S]*p_action => 'update'/,
    );
    expect(normalizedCommand).toContain("v_product.status = 'draft'");
    expect(normalizedCommand).toMatch(
      /v_product\.status = 'inactive'[\s\S]*'SUPPLIER_PRODUCT_STATE_CONFLICT'/,
    );
    expect(normalizedCommand).toContain("v_sku_fields_changed");
    expect(normalizedCommand).toContain("v_parent_key || ':sku-create'");
    expect(normalizedCommand).toContain("v_parent_key || ':sku-update'");
    expect(normalizedCommand).toContain("v_parent_key || ':sku-activate'");
    expect(normalizedCommand).toContain("v_parent_key || ':product-activate'");
  });

  test("versions only changed prices and preserves the earliest future version", () => {
    expect(normalizedCommand).toContain(
      "v_immediate_effective_until := v_future_price_list.effective_from",
    );
    expect(normalizedCommand).toContain(
      "ORDER BY price_list.effective_from, price_list.version_number, price_list.id",
    );
    expect(normalizedCommand).toContain(
      "v_current_price_list.id IS DISTINCT FROM p_expected_price_list_id",
    );
    expect(normalizedCommand).toContain(
      "v_current_price_list.row_version IS DISTINCT FROM p_expected_price_list_version",
    );
    expect(normalizedCommand).toContain("v_price_changed := false");
    expect(normalizedCommand).toContain("v_price_version_created := false");
    expect(normalizedCommand).toContain(
      "v_current_price_item.purchase_unit_id = v_sku.purchase_unit_id",
    );
    expect(normalizedCommand).toContain(
      "v_current_price_item.base_unit_id = v_sku.base_unit_id",
    );
    expect(normalizedCommand).toContain(
      "v_current_price_item.base_unit_conversion = v_sku.base_unit_conversion",
    );
    expect(normalizedCommand).toMatch(
      /IF v_price_changed THEN[\s\S]*command_supplier_price_list_v2[\s\S]*ELSE v_current_price := jsonb_build_object/,
    );
    expect(normalizedCommand).toContain(
      "'effective_until', v_immediate_effective_until",
    );
    expect(normalizedCommand).toMatch(
      /INSERT INTO public\.supplier_price_list_items[\s\S]*SELECT/,
    );
    expect(normalizedCommand.match(/command_supplier_price_item_v2\(/g))
      .toHaveLength(1);
    expect(normalizedCommand).not.toMatch(
      /FOREACH[\s\S]*command_supplier_price_item_v2/,
    );
    expect(normalizedCommand).toContain("v_current_price_list.id IS NOT NULL");
    expect(normalizedCommand).not.toContain(
      "p_price_list_id => v_future_price_list.id",
    );
    expect(normalizedCommand).toContain("'SUPPLIER_PRICE_PERIOD_CONFLICT'");
  });

  test("scopes write-time periods and overlap checks to the target SKU", () => {
    expect(normalizedCommand).toMatch(
      /SELECT count\(\*\)[\s\S]*FROM public\.supplier_price_lists AS price_list JOIN public\.supplier_price_list_items AS item[\s\S]*item\.supplier_sku_id = p_supplier_sku_id[\s\S]*IF v_current_count > 1/,
    );
    expect(normalizedCommand).toMatch(
      /INTO v_current_price_list[\s\S]*JOIN public\.supplier_price_list_items AS item[\s\S]*item\.supplier_sku_id = p_supplier_sku_id/,
    );
    expect(normalizedCommand).toMatch(
      /INTO v_future_price_list[\s\S]*JOIN public\.supplier_price_list_items AS item[\s\S]*item\.supplier_sku_id = p_supplier_sku_id/,
    );
    expect(normalizedCommand).toContain(
      "later_item.supplier_sku_id = earlier_item.supplier_sku_id",
    );
    expect(normalizedCommand).not.toContain(
      "FROM public.supplier_price_lists AS earlier JOIN public.supplier_price_lists AS later",
    );
    expect(normalizedCommand).not.toContain(
      "p_price_list_id => v_future_price_list.id",
    );
  });

  test("verifies one exact catalog fact and persists the strict saved envelope", () => {
    const resolverAt = normalizedCommand.indexOf(
      "resolve_supplier_purchase_order_catalog",
    );
    const responseAt = normalizedCommand.indexOf("v_response := jsonb_build_object");
    const resolver = normalizedCommand.slice(resolverAt, responseAt);

    expect(resolver).toContain("v_effective_sku ->> 'sku_code', 1, 1");
    expect(resolver).toContain("(v_catalog_response ->> 'total')::bigint <> 1");
    expect(resolver).toContain(
      "jsonb_array_length(v_catalog_response -> 'items') <> 1",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_product_id' IS DISTINCT FROM p_supplier_product_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_sku_id' IS DISTINCT FROM p_supplier_sku_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_price_list_id' IS DISTINCT FROM v_effective_price_list_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_price_list_item_id' IS DISTINCT FROM v_effective_price_item_id::text",
    );
    expect(resolver).toContain(
      "(v_catalog_item ->> 'base_unit_conversion')::numeric(18, 8) <> v_sku.base_unit_conversion",
    );
    expect(resolver).toContain(
      "(v_catalog_item ->> 'unit_price')::numeric(14, 2) <> v_unit_price",
    );
    expect(resolver).toContain(
      "(v_catalog_item ->> 'tax_rate')::numeric(7, 6) <> v_tax_rate",
    );
    expect(resolver).toContain(
      "v_catalog_item -> 'tax_inclusive' IS DISTINCT FROM p_price -> 'tax_inclusive'",
    );
    expect(resolver).toContain(
      "(v_catalog_item ->> 'effective_from')::timestamptz IS DISTINCT FROM v_effective_from",
    );

    expect(normalizedCommand).toContain(
      "v_response := jsonb_build_object( 'status', 'saved', 'idempotent', false, 'price_version_created', v_price_version_created, 'product', to_jsonb(v_product), 'sku', to_jsonb(v_sku), 'current_price', v_current_price, 'catalog_item', v_catalog_item, 'next_scheduled_effective_from', v_future_price_list.effective_from, 'available_actions', jsonb_build_array('edit', 'deactivate') )",
    );
    expect(normalizedCommand).toContain(
      "'supplier_purchasable_sku_v1:' || p_action",
    );
    expect(normalizedCommand).toContain(
      "jsonb_build_object( '_fingerprint', v_parent_fingerprint, '_request', v_parent_request )",
    );
    expect(normalizedCommand).toContain("'supplier_sku', p_supplier_sku_id");
    expect(normalizedCommand).toContain("v_sku.version");
    expect(normalizedCommand).not.toContain("WHEN OTHERS");
  });
});
