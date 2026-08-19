import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260819120000_create_supplier_product_v2_commands.sql",
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

describe("supplier product v2 command migration", () => {
  test("is a forward-only transaction that adds the tenant write source", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toContain("supplier_products_operation_source_check");
    expect(sql).toContain("supplier_skus_operation_source_check");
    expect(sql).toContain("'tenant_proxy', 'platform', 'tenant'");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
  });

  test("revalidates platform staff permission and active tenant relationships", () => {
    const context = compact(extractFunction("assert_supplier_product_v2_context"));

    expect(context).toContain("employee.user_id = p_actor_user_id");
    expect(context).toContain("employee.status = 'active'");
    expect(context).toContain("employee.tenant_id IS NULL");
    expect(context).toContain("'platform_admin' = ANY(v_platform_role_codes)");
    expect(context).toContain("role.tenant_id IS NULL");
    expect(context).toContain("permission.code = 'platform.supplier-product.manage'");
    expect(context).toContain("v_override_effect = 'deny'");
    expect(context).toContain("v_override_effect = 'allow'");
    expect(context).toContain(
      "COALESCE(v_override_effect = 'deny', false)",
    );
    expect(context).toContain(
      "COALESCE(v_override_effect = 'allow', false)",
    );
    expect(context).toContain("tenant_supplier.relationship_status = 'active'");
    expect(context).toContain("tenant_supplier.tenant_id = p_tenant_id");
    expect(context).toContain("tenant_supplier.supplier_id = p_supplier_id");
  });

  test("serializes every command in one actor and idempotency namespace", () => {
    for (const name of [
      "command_supplier_product_v2",
      "command_supplier_sku_v2",
      "replace_supplier_sku_unit_conversions_v2",
    ]) {
      const command = compact(extractFunction(name));
      expect(command).toContain(
        "'supplier-command:' || p_actor_user_id::text || ':' || btrim(p_idempotency_key)",
      );
      expect(command).not.toMatch(/supplier-(?:product|sku)(?:-conversion)?-v2:/);
    }
  });

  test("validates actor, relationship and resource visibility before replay", () => {
    for (const name of [
      "command_supplier_product_v2",
      "command_supplier_sku_v2",
      "replace_supplier_sku_unit_conversions_v2",
    ]) {
      const command = compact(extractFunction(name));
      const actorAt = command.indexOf("assert_supplier_product_v2_context");
      const visibilityAt = command.indexOf("FOR UPDATE");
      const replayAt = command.indexOf("FROM public.supplier_command_events");

      expect(actorAt, name).toBeGreaterThanOrEqual(0);
      expect(visibilityAt, name).toBeGreaterThan(actorAt);
      expect(replayAt, name).toBeGreaterThan(visibilityAt);
      expect(command).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    }
  });

  test("writes immutable ownership and the non-proxy tenant audit source", () => {
    const commands = compact([
      extractFunction("command_supplier_product_v2"),
      extractFunction("command_supplier_sku_v2"),
      extractFunction("replace_supplier_sku_unit_conversions_v2"),
    ].join("\n"));

    expect(commands).toContain("ownership_scope");
    expect(commands).toContain("owner_tenant_id");
    expect(commands).toContain("operation_source = CASE WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END");
    expect(commands).toContain("proxy_reason = NULL");
    expect(commands).toContain("p_expected_version");
    expect(commands).toContain("INSERT INTO public.supplier_command_events");
    expect(commands).toContain("spec_values");
    expect(commands).toContain("batch_managed");
    expect(commands).toContain("color_managed");
    expect(commands).toContain("serial_managed");
    expect(commands).not.toMatch(/parse.*sku.*name/i);
  });

  test("bounds conversion precision and edge count inside the v2 command", () => {
    const command = compact(
      extractFunction("replace_supplier_sku_unit_conversions_v2"),
    );

    expect(command).toContain("jsonb_array_length(p_edges) > 100");
    expect(command).toContain("v_factor numeric(18, 8)");
    expect(command).toContain("v_factor := public.validate_supplier_sku_unit_conversion_graph");
    expect(command).not.toContain(
      "validate_supplier_sku_unit_conversion_graph( p_supplier_sku_id, p_edges )::numeric(18, 6)",
    );
    expect(command).toContain("(edge.value ->> 'factor')::numeric(18, 6)");
    expect(command).toContain("validate_supplier_sku_unit_conversion_graph");
    expect(command).toContain("supplier_product_id = p_supplier_product_id");
    expect(command).toContain("SUPPLIER_SKU_NOT_FOUND");
  });

  test("replay requires the resource to remain visible and audits pre-update state", () => {
    const product = compact(extractFunction("command_supplier_product_v2"));
    const sku = compact(extractFunction("command_supplier_sku_v2"));
    const conversions = compact(
      extractFunction("replace_supplier_sku_unit_conversions_v2"),
    );

    expect(product).toContain(
      "IF v_event.id IS NOT NULL AND v_product.id IS NULL THEN",
    );
    expect(sku).toContain(
      "IF v_event.id IS NOT NULL AND v_sku.id IS NULL THEN",
    );
    expect(conversions).toContain("v_before := to_jsonb(v_sku)");
    expect(conversions).toContain(
      "v_before || jsonb_build_object('_request', v_request)",
    );
  });

  test("locks the product before atomically guarding category changes with SKUs", () => {
    const product = compact(extractFunction("command_supplier_product_v2"));
    const productLockAt = product.indexOf("FROM public.supplier_products AS product");
    const guardAt = product.indexOf(
      "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
    );
    const updateAt = product.indexOf("UPDATE public.supplier_products AS product");

    expect(productLockAt).toBeGreaterThanOrEqual(0);
    expect(product.slice(productLockAt)).toContain("FOR UPDATE");
    expect(guardAt).toBeGreaterThan(productLockAt);
    expect(updateAt).toBeGreaterThan(guardAt);
    expect(product).toContain("p_payload ? 'category_id'");
    expect(product).toContain(
      "(p_payload ->> 'category_id')::uuid IS DISTINCT FROM v_product.category_id",
    );
    expect(product).toContain("FROM public.supplier_skus AS sku");
    expect(product).toContain("sku.supplier_product_id = p_product_id");

    const sku = compact(extractFunction("command_supplier_sku_v2"));
    expect(sku.indexOf("FROM public.supplier_products AS product"))
      .toBeLessThan(sku.indexOf("FROM public.supplier_skus AS sku"));
  });

  test("exposes only v2 commands and leaves every legacy writer closed", () => {
    for (const name of [
      "command_supplier_product_v2",
      "command_supplier_sku_v2",
      "replace_supplier_sku_unit_conversions_v2",
    ]) {
      expect(compact(sql)).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
      expect(compact(sql)).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "TO service_role;",
      ));
    }

    for (const name of [
      "create_supplier_product",
      "create_supplier_sku",
      "create_platform_supplier_product",
      "mutate_supplier_product",
      "mutate_supplier_sku_for_product",
    ]) {
      expect(sql).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\(`,
      ));
    }
  });
});
