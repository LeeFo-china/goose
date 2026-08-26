import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260826140000_create_supplier_purchasable_product_command.sql",
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

function expectFragmentsOrdered(value: string, fragments: readonly string[]): void {
  let cursor = 0;

  for (const fragment of fragments) {
    const index = value.indexOf(fragment, cursor);
    expect(index, `missing ordered contract ${fragment}`).toBeGreaterThanOrEqual(0);
    cursor = index + fragment.length;
  }
}

describe("supplier purchasable product command migration", () => {
  test("creates the exact private composite command in a bounded transaction", () => {
    const command = extractFunction("command_supplier_purchasable_product_v1");

    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(compact(command)).toContain(
      "p_product_id uuid, p_sku_id uuid, p_tenant_id uuid, " +
        "p_tenant_supplier_id uuid, p_supplier_id uuid, p_product jsonb, " +
        "p_sku jsonb, p_price jsonb, p_actor_user_id uuid, " +
        "p_actor_employee_id uuid, p_idempotency_key text",
    );
    expect(command).toContain("RETURNS jsonb");
    expect(command).toContain("SECURITY DEFINER");
    expect(command).toContain("SET search_path = pg_catalog, public");
  });

  test("validates before locks and composes the existing commands in order", () => {
    const command = extractFunction("command_supplier_purchasable_product_v1");

    expectOrdered(command, [
      /jsonb_typeof\(p_product\) <> 'object'/,
      /jsonb_typeof\(p_sku\) <> 'object'/,
      /jsonb_typeof\(p_price\) <> 'object'/,
      /supplier-purchasable-product:/,
      /FROM public\.tenant_suppliers[\s\S]*FOR UPDATE/,
      /command_supplier_product_v2/,
      /command_supplier_sku_v2/,
      /command_supplier_price_list_v2/,
      /command_supplier_price_item_v2/,
      /resolve_supplier_purchase_order_catalog/,
      /INSERT INTO public\.supplier_command_events/,
    ]);

    const normalized = compact(command);
    const firstLockAt = normalized.indexOf("pg_advisory_xact_lock");
    expect(firstLockAt).toBeGreaterThanOrEqual(0);
    expect(normalized.indexOf("jsonb_object_keys(p_product)"))
      .toBeLessThan(firstLockAt);
    expect(normalized.indexOf("jsonb_object_keys(p_sku)"))
      .toBeLessThan(firstLockAt);
    expect(normalized.indexOf("jsonb_object_keys(p_price)"))
      .toBeLessThan(firstLockAt);
    expect(normalized).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    expect(normalized).not.toContain("WHEN OTHERS");
  });

  test("replays or conflicts under the parent lock before mutable checks", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expectFragmentsOrdered(command, [
      "v_parent_fingerprint :=",
      "v_parent_key := 'supplier-purchasable-product:'",
      "p_tenant_id::text || ':' || btrim(p_idempotency_key)",
      "pg_advisory_xact_lock",
      "FROM public.supplier_command_events AS event",
      "WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = v_parent_key",
      "v_event.tenant_id IS DISTINCT FROM p_tenant_id",
      "v_event.resource_type <> 'supplier_product'",
      "v_event.resource_id <> p_product_id",
      "v_event.command <> 'supplier_purchasable_product_v1:create'",
      "v_event.from_state ->> '_fingerprint' IS DISTINCT FROM v_parent_fingerprint",
      "v_event.from_state -> '_request' IS DISTINCT FROM v_parent_request",
      "MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT'",
      "RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true)",
      "FROM public.employees AS employee",
      "FROM public.tenant_suppliers AS relationship",
      "FOR UPDATE OF relationship",
      "'supplier-price-series:'",
    ]);
  });

  test("derives child keys and invokes product and SKU commands in lifecycle order", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expectFragmentsOrdered(command, [
      "v_child_key := v_parent_key || ':product-create'",
      "p_action => 'create', p_ownership_scope => 'tenant', p_tenant_id => p_tenant_id, p_tenant_supplier_id => p_tenant_supplier_id, p_supplier_id => p_supplier_id, p_product_id => p_product_id",
      "p_payload => p_product",
      "p_idempotency_key => v_child_key",
      "v_child_key := v_parent_key || ':product-activate'",
      "p_action => 'activate'",
      "p_product_id => p_product_id",
      "p_expected_version => (v_product_response ->> 'version')::integer",
      "v_child_key := v_parent_key || ':sku-create'",
      "p_action => 'create'",
      "p_supplier_product_id => p_product_id, p_sku_id => p_sku_id",
      "p_payload => p_sku",
      "v_child_key := v_parent_key || ':sku-activate'",
      "p_action => 'activate'",
      "p_supplier_product_id => p_product_id, p_sku_id => p_sku_id",
      "p_expected_version => (v_sku_response ->> 'version')::integer",
    ]);
  });

  test("versions and verifies copied prices before publishing the replacement", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expectFragmentsOrdered(command, [
      "v_child_key := v_parent_key || ':price-list-new-version'",
      "p_action => 'new_version'",
      "p_price_list_id => v_source_price_list.id, p_new_price_list_id => v_price_list_id",
      "FROM public.supplier_price_list_items AS old_item",
      "FROM public.supplier_price_list_items AS copied_item",
      "v_child_key := v_parent_key || ':price-item-upsert'",
      "p_action => 'upsert'",
      "p_item_id => v_price_item_id, p_price_list_id => v_price_list_id",
      "'sku_id', p_sku_id, 'unit_price', p_price ->> 'unit_price', 'tax_rate', p_price ->> 'tax_rate', 'tax_inclusive', p_price -> 'tax_inclusive'",
      "v_child_key := v_parent_key || ':price-list-retire-source'",
      "p_action => 'retire'",
      "v_child_key := v_parent_key || ':price-list-publish'",
      "p_action => 'publish'",
      "p_price_list_id => v_price_list_id",
    ]);
  });

  test("requires one exact resolver result and verifies catalog and price facts", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );
    const resolver = command.slice(
      command.indexOf("resolve_supplier_purchase_order_catalog"),
      command.indexOf("v_response := jsonb_build_object"),
    );

    expect(resolver).toContain("p_sku ->> 'sku_code', 1, 100");
    expect(resolver).toContain("v_catalog_response ->> 'total'");
    expect(resolver).toContain("jsonb_array_length(v_catalog_response -> 'items')");
    expect(resolver).toContain("(v_catalog_response ->> 'total')::bigint <> 1");
    expect(resolver).toContain(
      "jsonb_array_length(v_catalog_response -> 'items') <> 1",
    );
    expect(resolver).toContain("v_catalog_item := v_catalog_response -> 'items' -> 0");
    expect(resolver).not.toContain("LIMIT 1");
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_product_id' IS DISTINCT FROM p_product_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_sku_id' IS DISTINCT FROM p_sku_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_price_list_id' IS DISTINCT FROM v_price_list_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'supplier_price_list_item_id' IS DISTINCT FROM v_price_item_id::text",
    );
    expect(resolver).toContain(
      "v_catalog_item ->> 'purchase_unit_id' IS DISTINCT FROM v_purchase_unit_id::text",
    );
    expect(resolver).toContain(
      "v_price_list_response -> 'price_list' ->> 'tenant_supplier_id' IS DISTINCT FROM p_tenant_supplier_id::text",
    );
    expect(resolver).toContain(
      "v_price_list_response -> 'price_list' ->> 'supplier_id' IS DISTINCT FROM p_supplier_id::text",
    );
    expect(resolver).toContain(
      "v_price_list_response -> 'price_list' ->> 'currency' IS DISTINCT FROM 'CNY'",
    );
    expect(resolver).toContain(
      "v_price_list_response -> 'price_list' ->> 'lifecycle_status' IS DISTINCT FROM 'published'",
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
    expect(resolver).toContain("'catalog_result_not_exact'");
    expect(resolver).toContain("'catalog_item_mismatch'");
  });

  test("exposes the command only to service_role", () => {
    const normalized = compact(sql);

    expect(normalized).toMatch(
      /REVOKE ALL ON FUNCTION public\.command_supplier_purchasable_product_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.command_supplier_purchasable_product_v1\([\s\S]*?TO service_role;/,
    );
  });

  test("classifies only known uniqueness conflicts and propagates unknown SQL errors", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expect(command).toContain(
      "GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME",
    );
    expect(command).toContain("supplier_products_tenant_code_unique_idx");
    expect(command).toContain("supplier_skus_tenant_code_unique_idx");
    expect(command).toMatch(
      /WHEN unique_violation THEN GET STACKED DIAGNOSTICS[\s\S]*?IF v_constraint_name IN \([\s\S]*?ELSE RAISE; END IF/,
    );
    expect(command).not.toContain("WHEN OTHERS");
  });

  test("returns planned error envelopes without committing partial child writes", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expect(command).toMatch(
      /FROM public\.employees AS employee[\s\S]*?IF NOT FOUND THEN RETURN jsonb_build_object\( 'status', 'validation_error',[\s\S]*?'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID'/,
    );
    expect(command).toMatch(
      /FROM public\.tenant_suppliers AS relationship[\s\S]*?FOR UPDATE OF relationship; IF NOT FOUND THEN RETURN jsonb_build_object\( 'status', 'state_conflict',[\s\S]*?'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'/,
    );
    expect(command).toContain(
      "GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT, v_error_detail = PG_EXCEPTION_DETAIL",
    );
    expect(command).toMatch(
      /BEGIN v_child_key :=[\s\S]*?EXCEPTION[\s\S]*?WHEN SQLSTATE 'P0001' THEN[\s\S]*?v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED'[\s\S]*?RETURN jsonb_build_object\( 'status', 'state_conflict'/,
    );
    expect(command).toMatch(
      /v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED'[\s\S]*?v_error_message = 'SUPPLIER_PROXY_ACTOR_INVALID'[\s\S]*?v_error_message IN \( 'TENANT_SUPPLIER_NOT_FOUND', 'SUPPLIER_NOT_FOUND', 'SUPPLIER_ORDER_NOT_ELIGIBLE',[\s\S]*?'SUPPLIER_PRICE_LIST_INVALID_ACTION',[\s\S]*?'UNIT_CONVERSION_INVALID' \)[\s\S]*?ELSE RAISE; END IF/,
    );
    expectFragmentsOrdered(command, [
      "BEGIN v_child_key := v_parent_key || ':product-create'",
      "resolve_supplier_purchase_order_catalog",
      "INSERT INTO public.supplier_command_events",
      "EXCEPTION WHEN unique_violation THEN",
      "WHEN SQLSTATE 'P0001' THEN",
    ]);
    expect(command).not.toContain("WHEN OTHERS");
  });
});
