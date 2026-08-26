import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { Database } from "./database";

type Tables = Database["public"]["Tables"];
type Relationship<Table extends keyof Tables> =
  Tables[Table]["Relationships"][number];

const id = ["id"] as const;
const expectedCategory = [
  relation("catalog_categories_mapped_platform_category_id_fkey", "mapped_platform_category_id", "catalog_categories", "id"),
] satisfies readonly Relationship<"catalog_categories">[];
const expectedBrand = [
  relation("catalog_brands_category_id_fkey", "category_id", "catalog_categories", "id"),
  relation("catalog_brands_mapped_platform_brand_id_fkey", "mapped_platform_brand_id", "catalog_brands", "id"),
] satisfies readonly Relationship<"catalog_brands">[];
const expectedSpecs = [
  relation("catalog_spec_definitions_category_id_fkey", "category_id", "catalog_categories", "id"),
  relation("catalog_spec_definitions_owner_tenant_id_fkey", "owner_tenant_id", "platform_ocr_tenant_policy_overview", "tenant_id"),
  relation("catalog_spec_definitions_owner_tenant_id_fkey", "owner_tenant_id", "tenants", "id"),
  relation("catalog_spec_definitions_source_platform_spec_id_fkey", "source_platform_spec_id", "catalog_spec_definitions", "id"),
  relation("catalog_spec_definitions_created_by_employee_id_fkey", "created_by_employee_id", "employees", "id"),
  relation("catalog_spec_definitions_updated_by_employee_id_fkey", "updated_by_employee_id", "employees", "id"),
] satisfies readonly Relationship<"catalog_spec_definitions">[];
const expectedSuggestions = [
  relation("catalog_unit_suggestions_tenant_id_fkey", "tenant_id", "platform_ocr_tenant_policy_overview", "tenant_id"),
  relation("catalog_unit_suggestions_tenant_id_fkey", "tenant_id", "tenants", "id"),
  relation("catalog_unit_suggestions_processed_by_employee_id_fkey", "reviewed_by_employee_id", "employees", "id"),
  relation("catalog_unit_suggestions_created_by_employee_id_fkey", "submitted_by_employee_id", "employees", "id"),
  relation("catalog_unit_suggestions_approved_catalog_unit_id_fkey", "approved_catalog_unit_id", "catalog_units", "id"),
] satisfies readonly Relationship<"catalog_unit_suggestions">[];

describe("supplier catalog generated database relationships", () => {
  test("matches every foreign key materialized by the catalog migrations", () => {
    const databaseTypes = readFileSync(new URL("./database.ts", import.meta.url), "utf8");
    const createSql = normalized(readFileSync(new URL(
      "../../../../supabase/migrations/20260813170000_create_tenant_private_catalog.sql",
      import.meta.url,
    ), "utf8"));
    const materializeSql = normalized(readFileSync(new URL(
      "../../../../supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql",
      import.meta.url,
    ), "utf8"));
    const brandCategorySql = normalized(readFileSync(new URL(
      "../../../../supabase/migrations/20260826093000_add_tenant_catalog_brand_category.sql",
      import.meta.url,
    ), "utf8"));

    for (const fragment of [
      "mapped_platform_category_id uuid null references public.catalog_categories(id)",
      "mapped_platform_brand_id uuid null references public.catalog_brands(id)",
      "category_id uuid not null references public.catalog_categories(id)",
      "owner_tenant_id uuid null references public.tenants(id)",
      "source_platform_spec_id uuid null references public.catalog_spec_definitions(id)",
      "created_by_employee_id uuid not null references public.employees(id)",
      "updated_by_employee_id uuid not null references public.employees(id)",
      "tenant_id uuid not null references public.tenants(id)",
      "processed_by_employee_id uuid null references public.employees(id)",
    ]) expect(createSql).toContain(fragment);

    expect(brandCategorySql).toContain(
      "foreign key (category_id) references public.catalog_categories(id)",
    );

    for (const fragment of [
      "rename column processed_by_employee_id to reviewed_by_employee_id",
      "rename column created_by_employee_id to submitted_by_employee_id",
      "approved_catalog_unit_id uuid null references public.catalog_units(id)",
    ]) expect(materializeSql).toContain(fragment);

    expect([
      ...expectedCategory,
      ...expectedBrand,
      ...expectedSpecs,
      ...expectedSuggestions,
    ]).toHaveLength(14);
    for (const relationship of [
      ...expectedCategory,
      ...expectedBrand,
      ...expectedSpecs,
      ...expectedSuggestions,
    ]) {
      const marker = `foreignKeyName: "${relationship.foreignKeyName}"`;
      const blocks = databaseTypes.split(marker).slice(1)
        .map((suffix) => suffix.slice(0, 320));
      expect(blocks.some((block) =>
        block.includes(`columns: ["${relationship.columns[0]}"]`) &&
        block.includes(
          `referencedRelation: "${relationship.referencedRelation}"`,
        )
      )).toBe(true);
    }
    expect(id).toEqual(["id"]);
  });
});

function relation<Name extends string, Column extends string,
  Referenced extends string, ReferencedColumn extends string>(
  foreignKeyName: Name,
  column: Column,
  referencedRelation: Referenced,
  referencedColumn: ReferencedColumn,
) {
  return {
    foreignKeyName,
    columns: [column] as [Column],
    isOneToOne: false as const,
    referencedRelation,
    referencedColumns: [referencedColumn] as [ReferencedColumn],
  };
}

function normalized(sql: string) {
  return sql.toLowerCase().replace(/\s+/g, " ");
}
