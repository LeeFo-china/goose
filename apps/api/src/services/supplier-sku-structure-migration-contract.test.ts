import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260819090000_harden_supplier_product_sku_contracts.sql",
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

describe("supplier SKU structured spec hardening migration", () => {
  test("keeps historical NULL readable but requires object values on new writes", () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT supplier_skus_v3_spec_values_object_check[\s\S]*CHECK \([\s\S]*spec_values IS NULL[\s\S]*jsonb_typeof\(spec_values\) = 'object'[\s\S]*\) NOT VALID;/,
    );
    expect(sql).not.toMatch(
      /UPDATE public\.supplier_skus(?: AS [a-z_]+)?\s+SET\s+spec_values/i,
    );
    expect(sql).not.toMatch(/ALTER COLUMN spec_values SET NOT NULL/i);

    const validator = compact(
      extractFunction("validate_supplier_sku_spec_values"),
    );
    expect(validator).toContain("jsonb_typeof(NEW.spec_values) IS DISTINCT FROM 'object'");
    expect(validator).toContain("product.category_id");
    expect(validator).toContain("definition.status = 'active'");
    expect(validator).toContain("jsonb_object_keys(NEW.spec_values)");
    expect(validator).toContain("definition.code = spec_key.code");
    expect(validator).toContain("definition.is_required");
    expect(validator).toContain("NEW.spec_values ? definition.code");
    expect(validator).toContain("SPEC_TEMPLATE_VALIDATION_ERROR");
  });

  test("uses catalog spec code as the approved JSON key contract", () => {
    const validator = compact(
      extractFunction("validate_supplier_sku_spec_values"),
    );

    expect(validator).toContain("NEW.spec_values -> definition.code");
    expect(validator).not.toContain("definition.name");
    expect(validator).not.toContain("definition.id::text");
  });

  test("validates every canonical value type and enum option", () => {
    const valueValidator = compact(
      extractFunction("supplier_sku_spec_value_is_valid"),
    );

    for (const valueType of [
      "text",
      "number",
      "boolean",
      "date",
      "single_enum",
      "multi_enum",
    ]) {
      expect(valueValidator).toContain(`'${valueType}'`);
    }
    expect(valueValidator).toContain("jsonb_typeof(p_value)");
    expect(valueValidator).toContain("definition.enum_options");
    expect(valueValidator).toContain("jsonb_array_elements(p_value)");
    expect(valueValidator).toContain("count(DISTINCT element.value)");
    expect(valueValidator).toContain("to_date");
    expect(valueValidator).toContain("SPEC_TEMPLATE_VALIDATION_ERROR");
  });

  test("validates specs on every SKU insert and update", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER tr_supplier_skus_v3_validate_specs\s+BEFORE INSERT OR UPDATE ON public\.supplier_skus\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.validate_supplier_sku_spec_values\(\);/,
    );
    for (const functionName of [
      "supplier_sku_spec_value_is_valid",
      "validate_supplier_sku_spec_values",
    ]) {
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
    }
  });
});

describe("supplier SKU unit conversion graph hardening migration", () => {
  test("retains the physical edge checks and protects direct writes", () => {
    expect(sql).toContain("supplier_sku_unit_conversions_factor_check");
    expect(sql).toContain("supplier_sku_unit_conversions_self_check");
    expect(sql).toContain("supplier_sku_unit_conversions_sku_edge_key");
    expect(sql).toContain(
      "ALTER TABLE public.supplier_sku_unit_conversions FORCE ROW LEVEL SECURITY;",
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.supplier_sku_unit_conversions[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.supplier_sku_unit_conversions\s+TO service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT (?:INSERT|UPDATE|DELETE)[\s\S]*supplier_sku_unit_conversions[\s\S]*TO service_role/,
    );
  });

  test("validates active same-dimension edges as one relevant acyclic path", () => {
    const validator = compact(
      extractFunction("validate_supplier_sku_unit_conversion_graph"),
    );

    expect(validator).toContain("jsonb_typeof(p_edges) IS DISTINCT FROM 'array'");
    expect(validator).toContain("jsonb_array_length(p_edges) > 100");
    expect(validator).toContain("LANGUAGE plpgsql VOLATILE");
    expect(validator).toContain(
      "raw_edge.value ->> 'factor' !~ '^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,6})?$'",
    );
    expect(validator).toContain("edge.factor <= 0");
    expect(validator).toContain("edge.from_unit_id = edge.to_unit_id");
    expect(validator).toContain("GROUP BY edge.from_unit_id, edge.to_unit_id HAVING count(*) > 1");
    expect(validator).toContain("from_unit.status IS DISTINCT FROM 'active'");
    expect(validator).toContain("to_unit.status IS DISTINCT FROM 'active'");
    expect(validator).toContain("from_unit.unit_dimension IS NOT DISTINCT FROM to_unit.unit_dimension");
    expect(validator).toContain("purchase_unit.unit_dimension IS NOT DISTINCT FROM base_unit.unit_dimension");
    expect(validator).toContain("ORDER BY unit.id FOR SHARE");
    expect(validator).toContain("edge.to_unit_id = ANY(path.visited_units)");
    expect(validator).toContain("v_path_count IS DISTINCT FROM 1");
    expect(validator).toContain("v_relevant_edge_count IS DISTINCT FROM v_edge_count");
    expect(validator).toContain("v_conversion_factor::numeric(18, 8)");
    expect(validator).toContain("UNIT_CONVERSION_INVALID");
  });

  test("provides one atomic idempotent versioned replacement command", () => {
    const command = compact(
      extractFunction("replace_supplier_sku_unit_conversions"),
    );

    expect(command).toContain("SECURITY DEFINER");
    expect(command).toContain("SET search_path = pg_catalog, public");
    expect(command).toContain("p_expected_sku_version");
    expect(command).toContain("p_idempotency_key");
    expect(command).toContain("pg_advisory_xact_lock");
    expect(command).toContain("supplier_command_events");
    expect(command).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
    expect(command).toContain("SUPPLIER_VERSION_CONFLICT");
    expect(command).toContain("employee.user_id = p_actor_user_id");
    expect(command).toContain("employee.tenant_id IS NOT DISTINCT FROM p_acting_tenant_id");
    expect(command.indexOf("employee.user_id = p_actor_user_id")).toBeLessThan(
      command.indexOf("pg_advisory_xact_lock"),
    );
    expect(command).toContain("sku.owner_tenant_id IS NOT DISTINCT FROM p_acting_tenant_id");
    expect(command).toContain("DELETE FROM public.supplier_sku_unit_conversions");
    expect(command).toContain("INSERT INTO public.supplier_sku_unit_conversions");
    expect(command).toContain("base_unit_conversion = v_conversion_factor");
    expect(command).toContain("version = sku.version + 1");
  });

  test("keeps graph helpers private and exposes only the atomic command", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.validate_supplier_sku_unit_conversion_graph\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.replace_supplier_sku_unit_conversions\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions\([\s\S]*?TO service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.validate_supplier_sku_unit_conversion_graph/,
    );
  });
});
