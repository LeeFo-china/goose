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

  test("derives stable child keys, preserves prior prices, and verifies purchase readiness", () => {
    const command = compact(
      extractFunction("command_supplier_purchasable_product_v1"),
    );

    expect(command).toContain("v_parent_fingerprint");
    expect(command).toContain("v_parent_key");
    expect(command).toContain("v_child_key");
    expect(command).toContain("p_action => 'new_version'");
    expect(command).toContain("p_action => 'activate'");
    expect(command).toContain("p_action => 'publish'");
    expect(command).toContain("p_action => 'upsert'");
    expect(command).toContain("supplier_price_list_items");
    expect(command).toContain("supplier_sku_id");
    expect(command).toContain("catalog_item");
    expect(command).toContain("'status', 'created'");
    expect(command).toContain("'idempotent', false");
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

    expect(command).toContain("'status', 'validation_error'");
    expect(command).toContain("'status', 'state_conflict'");
    expect(command).toContain(
      "GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT, v_error_detail = PG_EXCEPTION_DETAIL",
    );
    expect(command).toMatch(
      /BEGIN v_child_key :=[\s\S]*?EXCEPTION[\s\S]*?WHEN SQLSTATE 'P0001' THEN[\s\S]*?v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED'[\s\S]*?RETURN jsonb_build_object\( 'status', 'state_conflict'/,
    );
    expect(command).toMatch(
      /v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED'[\s\S]*?ELSE RAISE; END IF/,
    );
  });
});
