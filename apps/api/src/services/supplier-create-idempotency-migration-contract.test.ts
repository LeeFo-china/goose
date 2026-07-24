import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723143000_create_supplier_foundation_commands.sql",
    import.meta.url,
  ),
  "utf8",
);

const createCommands = {
  create_supplier_qualification_type: {
    resourceType: "supplier_qualification_type",
    resourceKey: "qualification_type",
    generatedId: "qualification_type_id",
    fields: [
      "code",
      "name",
      "applicable_supplier_types",
      "warning_days",
      "is_required",
      "blocks_new_orders",
      "status",
      "sort_order",
      "actor_employee_id",
    ],
  },
  create_supplier_qualification: {
    resourceType: "supplier_qualification",
    resourceKey: "qualification",
    generatedId: "qualification_id",
    fields: [
      "supplier_id",
      "qualification_type_id",
      "document_file_id",
      "certificate_no",
      "valid_from",
      "valid_until",
      "actor_employee_id",
    ],
  },
  create_supplier_service_region: {
    resourceType: "supplier_service_region",
    resourceKey: "service_region",
    generatedId: "region_id",
    fields: [
      "supplier_id",
      "region_code",
      "region_level",
      "status",
      "valid_from",
      "valid_until",
      "actor_employee_id",
    ],
  },
  create_supplier_address: {
    resourceType: "supplier_address",
    resourceKey: "address",
    generatedId: "address_id",
    fields: [
      "supplier_id",
      "address_type",
      "province",
      "city",
      "district",
      "region_code",
      "address_detail",
      "longitude",
      "latitude",
      "is_default",
      "status",
      "actor_employee_id",
    ],
  },
  create_supplier_contact: {
    resourceType: "supplier_contact",
    resourceKey: "contact",
    generatedId: "contact_id",
    fields: [
      "supplier_id",
      "contact_type",
      "name",
      "phone",
      "email",
      "is_public",
      "is_primary",
      "status",
      "actor_employee_id",
    ],
  },
  create_catalog_category: {
    resourceType: "catalog_category",
    resourceKey: "category",
    generatedId: "category_id",
    fields: [
      "parent_id",
      "code",
      "name",
      "level",
      "status",
      "sort_order",
      "actor_employee_id",
    ],
  },
  create_catalog_brand: {
    resourceType: "catalog_brand",
    resourceKey: "brand",
    generatedId: "brand_id",
    fields: [
      "code",
      "name",
      "legal_name",
      "logo_file_id",
      "status",
      "sort_order",
      "actor_employee_id",
    ],
  },
  create_catalog_unit: {
    resourceType: "catalog_unit",
    resourceKey: "unit",
    generatedId: "unit_id",
    fields: [
      "code",
      "name",
      "symbol",
      "base_unit_id",
      "conversion_factor",
      "status",
      "sort_order",
      "actor_employee_id",
    ],
  },
} as const;

function extractFunction(name: string): string {
  const start = sql.search(new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\(`));
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("supplier create command migration contract", () => {
  test("extends the append-only ledger for every create resource", () => {
    const ledger = sql.match(
      /CREATE TABLE public\.supplier_command_events\s*\([\s\S]*?\n\);/,
    )?.[0] ?? "";
    for (const { resourceType } of Object.values(createCommands)) {
      expect(ledger).toContain(`'${resourceType}'`);
    }
    expect(ledger).toContain("UNIQUE (actor_user_id, idempotency_key)");
  });

  test("makes all eight creates atomic, private, and replayable", () => {
    for (const [name, contract] of Object.entries(createCommands)) {
      const fn = extractFunction(name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog, public");
      expect(fn).toContain("pg_advisory_xact_lock");
      expect(fn).toContain("FROM public.supplier_command_events");
      expect(fn).toContain("FOR UPDATE");
      expect(fn).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
      expect(fn).toContain("v_event.from_state -> '_request' IS DISTINCT FROM v_request");
      expect(fn).toContain(`v_event.resource_type <> '${contract.resourceType}'`);
      expect(fn).toContain(`v_event.command <> '${name}'`);
      expect(fn).toContain(`'${contract.resourceKey}', v_event.to_state`);
      expect(fn).toContain("'idempotent', true");
      expect(fn).toContain("INSERT INTO public.supplier_command_events");
      expect(fn).toContain("jsonb_build_object('_request', v_request)");
      expect(fn).not.toContain(
        `v_event.resource_id <> p_${contract.generatedId}`,
      );
      expect(fn).not.toContain(
        `'${contract.generatedId}', p_${contract.generatedId}`,
      );
      for (const field of contract.fields) {
        expect(fn).toContain(`'${field}', p_${field}`);
      }
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "FROM PUBLIC, anon, authenticated;",
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) ` +
          "TO service_role;",
      ));
    }
  });

  test("does not fingerprint generated IDs in the three existing creates", () => {
    const existing = [
      ["create_platform_supplier", "supplier_id"],
      ["create_tenant_supplier", "tenant_supplier_id"],
      ["create_supplier_contract", "contract_id"],
    ] as const;
    for (const [name, generatedId] of existing) {
      const fn = extractFunction(name);
      expect(fn).not.toContain(`'${generatedId}', p_${generatedId}`);
      expect(fn).not.toContain(`v_event.resource_id <> p_${generatedId}`);
      expect(fn).toContain("'idempotent', true");
      expect(fn).toContain("v_event.to_state");
    }
  });

  test("keeps catalog unit precision as text in request and response snapshots", () => {
    const fn = extractFunction("create_catalog_unit");
    expect(fn).toContain("p_conversion_factor text");
    expect(fn).toContain("p_conversion_factor::numeric(18, 6)");
    expect(fn).toContain("'conversion_factor', v_unit.conversion_factor::text");
  });
});
