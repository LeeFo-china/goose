import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const schemaSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql",
    import.meta.url,
  ),
  "utf8",
);
const behaviorSql = readFileSync(
  new URL(
    "../../../../scripts/fixtures/verify-tenant-supplier-catalog-command-behavior.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

function schemaFunctionBody(name: string): string {
  const start = schemaSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const end = schemaSql.indexOf("\n$$;", start);
  return end < 0 ? schemaSql.slice(start) : schemaSql.slice(start, end + 4);
}

function behaviorBlock(tag: string): string {
  const startMarker = `DO $${tag}$`;
  const endMarker = `\n$${tag}$;`;
  const start = behaviorSql.indexOf(startMarker);
  if (start < 0) return "";
  const end = behaviorSql.indexOf(endMarker, start);
  return end < 0 ? behaviorSql.slice(start) : behaviorSql.slice(start, end);
}

describe("tenant supplier catalog command domain boundaries", () => {
  test("uses optimistic versions without auditing conflicts", () => {
    for (const command of [
      "update_tenant_catalog_category",
      "update_tenant_catalog_brand",
      "update_catalog_spec_definition",
      "copy_platform_category_specs",
      "review_catalog_unit_suggestion",
    ]) {
      const body = functionBody(command);
      const conflict = body.indexOf("'status', 'version_conflict'");
      const audit = body.indexOf("INSERT INTO public.supplier_command_events");
      expect(body).toContain("SUPPLIER_VERSION_CONFLICT");
      expect(conflict).toBeGreaterThan(0);
      expect(audit).toBeGreaterThan(conflict);
    }
  });

  test("locks resources and rejects ownership changes", () => {
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SHARED_RESOURCE_READ_ONLY");
    expect(sql).toContain("OWNERSHIP_CONFLICT");
    expect(sql).not.toMatch(/SET[\s\S]{0,180}(?:ownership_scope|owner_tenant_id)\s*=/i);
  });

  test("takes the hierarchy advisory lock before category row locks", () => {
    for (const command of [
      "create_tenant_catalog_category",
      "update_tenant_catalog_category",
    ]) {
      const body = functionBody(command);
      const replayReturn = body.indexOf(
        "RETURN jsonb_build_object(",
        body.indexOf("IF FOUND THEN"),
      );
      const hierarchyLock = body.indexOf(
        "pg_catalog.pg_advisory_xact_lock(6720240723142000::bigint)",
      );
      const categoryRowLock = body.indexOf("FROM public.catalog_categories");
      expect(replayReturn).toBeGreaterThan(0);
      expect(hierarchyLock).toBeGreaterThan(replayReturn);
      expect(categoryRowLock).toBeGreaterThan(hierarchyLock);
    }
  });

  test("validates mappings in commands and delegates cycle/depth to the 122000 trigger", () => {
    const categorySql =
      functionBody("create_tenant_catalog_category") +
      functionBody("update_tenant_catalog_category");
    const hierarchyGuard = schemaFunctionBody(
      "validate_catalog_category_hierarchy",
    );
    expect(categorySql).toContain("v_parent.owner_tenant_id IS DISTINCT FROM p_tenant_id");
    expect(categorySql).toContain("v_mapped.ownership_scope <> 'platform'");
    expect(categorySql).toContain("v_mapped.status <> 'active'");
    expect(hierarchyGuard).toContain("MESSAGE = 'SUPPLIER_CATALOG_CYCLE'");
    expect(hierarchyGuard).toContain("MESSAGE = 'SUPPLIER_CATALOG_DEPTH_EXCEEDED'");
    expect(schemaSql).toMatch(
      /CREATE TRIGGER tr_catalog_categories_v2_validate_hierarchy[\s\S]*?EXECUTE FUNCTION public\.validate_catalog_category_hierarchy\(\)/,
    );
  });

  test("executes eight legal levels and rejects an unaudited ninth level", () => {
    const depthBehavior =
      behaviorBlock("category_depth") + behaviorBlock("category_depth_audit");
    expect(depthBehavior.match(
      /PERFORM public\.create_tenant_catalog_category\(/g,
    )).toHaveLength(9);
    expect(depthBehavior).toContain(
      "IF SQLERRM <> 'SUPPLIER_CATALOG_DEPTH_EXCEEDED'",
    );
    expect(depthBehavior).toContain(
      "RAISE EXCEPTION 'legal eight-level category chain incomplete'",
    );
    expect(depthBehavior).toContain("category.level = 8");
    expect(depthBehavior).toContain(
      "RAISE EXCEPTION 'ninth depth category persisted'",
    );
    expect(depthBehavior).toContain(
      "category.id = '93100000-0000-0000-0000-000000000009'",
    );
    expect(depthBehavior).toContain(
      "RAISE EXCEPTION 'ninth depth audit event persisted'",
    );
    expect(depthBehavior).toContain(
      "FROM public.supplier_command_events AS event",
    );
    expect(depthBehavior).toContain(
      "event.idempotency_key = 'verify-depth-level-9'",
    );
  });

  test("validates specs and copies only active platform leaf specs", () => {
    const create = functionBody("create_catalog_spec_definition");
    const update = functionBody("update_catalog_spec_definition");
    const copy = functionBody("copy_platform_category_specs");
    expect(create).toContain("NOT v_category.is_leaf");
    expect(create).toContain("v_category.status <> 'active'");
    expect(create).toContain("SPEC_TEMPLATE_VALIDATION_ERROR");
    expect(update).toContain("NOT v_category.is_leaf");
    expect(update).toContain("v_category.status <> 'active'");
    expect(update).toContain("v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id");
    expect(copy).toContain("source.status = 'active'");
    expect(copy).toContain("source_platform_spec_id");
    expect(copy).toMatch(/version = (?:v_)?tenant_category\.version \+ 1/);
  });

  test("allows only platform actors to create dimensioned units", () => {
    const body = functionBody("create_catalog_unit");
    expect(body).toContain("public.assert_platform_catalog_actor(");
    expect(body).toContain("btrim(p_conversion_factor) !~ '^[0-9]+([.][0-9]+)?$'");
    expect(body).toContain("split_part(btrim(p_conversion_factor), '.', 2)");
    expect(body).toContain("btrim(p_conversion_factor)::numeric(18, 6)");
    expect(body).toContain("v_conversion_factor <= 0");
    expect(body).toContain("'conversion_factor', v_conversion_factor_text");
    expect(body).toContain("btrim(p_unit_dimension) = 'legacy_unclassified'");
    expect(body).toContain("UNIT_CONVERSION_INVALID");
    expect(body).not.toContain("assert_tenant_supplier_actor");
  });
});
