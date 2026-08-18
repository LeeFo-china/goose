import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function functionBody(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = migration.indexOf(marker);
  if (start < 0) return "";
  const end = migration.indexOf("\n$$;", start);
  return end < 0 ? migration.slice(start) : migration.slice(start, end + 4);
}

const migration = read(
  "../../../../supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql",
);
const repository = read("../repositories/supplier-catalog-models.ts");
const behavior = read(
  "../../../../scripts/fixtures/verify-tenant-supplier-catalog-command-behavior.sql",
);

const resources = {
  create_catalog_category: {
    schema: "PlatformCategorySchema",
    key: "category",
    fields: [
      "id", "parent_id", "code", "name", "level", "status", "sort_order",
      "version", "created_by_employee_id", "updated_by_employee_id",
      "created_at", "updated_at",
    ],
  },
  create_catalog_brand: {
    schema: "PlatformBrandSchema",
    key: "brand",
    fields: [
      "id", "code", "name", "legal_name", "logo_file_id", "status",
      "sort_order", "version", "created_by_employee_id",
      "updated_by_employee_id", "created_at", "updated_at",
    ],
  },
} as const;

describe("legacy platform catalog create rollout", () => {
  test("keeps responses aligned with the current strict API schemas", () => {
    const auditStart = repository.indexOf("const audit = {");
    const auditEnd = repository.indexOf("};", auditStart);
    const auditSchema = repository.slice(auditStart, auditEnd);
    for (const definition of Object.values(resources)) {
      const start = repository.indexOf(`const ${definition.schema} = z.object({`);
      const end = repository.indexOf(".strict();", start);
      const schema = repository.slice(start, end + ".strict();".length);
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      for (const field of definition.fields) {
        expect(`${schema}\n${auditSchema}`).toContain(`${field}:`);
      }
      expect(schema).toContain(".strict()");
    }
  });

  test("replaces old creates without changing request identity", () => {
    for (const [name, definition] of Object.entries(resources)) {
      const body = functionBody(name);
      const requestStart = body.indexOf("v_request := jsonb_build_object(");
      const requestEnd = body.indexOf(");", requestStart);
      const request = body.slice(requestStart, requestEnd);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = pg_catalog, public");
      expect(body).toContain("public.assert_platform_catalog_actor(");
      expect(request).not.toContain(`'${definition.key}_id'`);
      expect(body).not.toContain(`'${definition.key}', v_event.to_state`);
      expect(body).not.toContain(`'${definition.key}', to_jsonb(`);
      for (const field of definition.fields) {
        expect(body).toContain(`'${field}'`);
      }
    }
  });

  test("covers first and replay key sets with regenerated ids", () => {
    expect(behavior).toContain("DO $legacy_platform_create_rollout$");
    expect(behavior).toContain("legacy category DTO keys invalid");
    expect(behavior).toContain("legacy brand DTO keys invalid");
    expect(behavior).toContain("legacy category replay created another row or event");
    expect(behavior).toContain("legacy brand replay created another row or event");
  });

  test("pins old create ACLs to service_role", () => {
    for (const name of Object.keys(resources)) {
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`),
      );
    }
  });
});
