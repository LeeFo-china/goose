import { CATALOG_SPEC_VALUE_TYPE_VALUES } from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export const CATEGORY_SELECT = [
  "id", "parent_id", "code", "name", "level", "full_name", "is_leaf",
  "mapped_platform_category_id", "ownership_scope", "owner_tenant_id",
  "status", "sort_order", "version", "created_by_employee_id",
  "updated_by_employee_id", "created_at", "updated_at",
].join(",");
export const BRAND_SELECT = [
  "id", "code", "name", "legal_name", "logo_file_id",
  "mapped_platform_brand_id", "ownership_scope", "owner_tenant_id",
  "status", "sort_order", "version", "created_by_employee_id",
  "updated_by_employee_id", "created_at", "updated_at",
].join(",");
export const UNIT_SELECT = [
  "id", "code", "name", "symbol", "base_unit_id",
  "conversion_factor::text", "unit_dimension", "status", "sort_order",
  "version", "created_by_employee_id", "updated_by_employee_id",
  "created_at", "updated_at",
].join(",");
export const UNIT_BASE_SELECT =
  "id,code,name,symbol,unit_dimension,status";
export const SPEC_SELECT = [
  "id", "category_id", "code", "name", "value_type", "enum_options",
  "unit_dimension", "is_required", "participates_in_sku_name",
  "is_filterable", "sort_order", "status", "version", "ownership_scope",
  "owner_tenant_id", "source_platform_spec_id", "created_by_employee_id",
  "updated_by_employee_id", "created_at", "updated_at",
].join(",");

const CatalogStatusSchema = z.enum(["active", "inactive"]);
const ownership = {
  ownership_scope: z.enum(["platform", "tenant"]),
  owner_tenant_id: z.uuid().nullable(),
};
const audit = {
  version: z.number().int().positive(),
  created_by_employee_id: z.uuid().optional(),
  updated_by_employee_id: z.uuid().optional(),
  created_at: z.string(),
  updated_at: z.string(),
};

export const PlatformCategorySchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  level: z.number().int().min(1).max(8),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...audit,
}).strict();
export const CatalogCategorySchema = PlatformCategorySchema.extend({
  full_name: z.string(),
  is_leaf: z.boolean(),
  mapped_platform_category_id: z.uuid().nullable(),
  ...ownership,
}).strict();

export const PlatformBrandSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string().nullable(),
  logo_file_id: z.uuid().nullable(),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...audit,
}).strict();
export const CatalogBrandSchema = PlatformBrandSchema.extend({
  mapped_platform_brand_id: z.uuid().nullable(),
  ...ownership,
}).strict();

export const CatalogUnitSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  base_unit_id: z.uuid().nullable(),
  conversion_factor: z.string(),
  unit_dimension: z.string(),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...audit,
}).strict();
export const CatalogUnitBaseSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  unit_dimension: z.string(),
  status: CatalogStatusSchema,
}).strict();
export const CatalogUnitListSchema = CatalogUnitSchema.extend({
  base_unit: CatalogUnitBaseSchema.nullable(),
}).strict();

export const CatalogSpecDefinitionSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  value_type: z.enum(CATALOG_SPEC_VALUE_TYPE_VALUES),
  enum_options: z.array(z.string()),
  unit_dimension: z.string().nullable(),
  is_required: z.boolean(),
  participates_in_sku_name: z.boolean(),
  is_filterable: z.boolean(),
  sort_order: z.number().int(),
  status: CatalogStatusSchema,
  source_platform_spec_id: z.uuid().nullable(),
  ...ownership,
  ...audit,
}).strict();

export const CatalogUnitSuggestionSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  suggested_code: z.string(),
  suggested_name: z.string(),
  suggested_symbol: z.string(),
  unit_dimension: z.string(),
  reason: z.string().nullable(),
  status: z.enum(["submitted", "approved", "rejected"]),
  version: z.number().int().positive(),
  submitted_by_employee_id: z.uuid().optional(),
  reviewed_by_employee_id: z.uuid().nullable().optional(),
  reviewed_at: z.string().nullable(),
  review_remark: z.string().nullable(),
  approved_catalog_unit_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const CatalogUnitSuggestionPageSchema = z.object({
  list: z.array(CatalogUnitSuggestionSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;
export type PlatformCategory = z.infer<typeof PlatformCategorySchema>;
export type CatalogBrand = z.infer<typeof CatalogBrandSchema>;
export type PlatformBrand = z.infer<typeof PlatformBrandSchema>;
export type CatalogUnitRecord = z.infer<typeof CatalogUnitSchema>;
export type CatalogUnit = z.infer<typeof CatalogUnitListSchema>;
export type CatalogSpecDefinition = z.infer<typeof CatalogSpecDefinitionSchema>;
export type CatalogUnitSuggestion = z.infer<typeof CatalogUnitSuggestionSchema>;
export type CatalogVisibility =
  | { kind: "platform" }
  | { kind: "tenant"; tenantId: string };
export type CatalogPage<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function normalizePage(input: { page?: number; pageSize?: number }) {
  const page = Number.isInteger(input.page) && (input.page ?? 0) > 0
    ? input.page!
    : 1;
  const pageSize = Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0
    ? Math.min(100, input.pageSize!)
    : 20;
  return { page, pageSize };
}

export function pageRange(input: { page: number; pageSize: number }) {
  const start = (input.page - 1) * input.pageSize;
  return { start, end: start + input.pageSize - 1 };
}

export function toPage<T>(
  list: T[],
  input: { page: number; pageSize: number },
  count: number | null,
): CatalogPage<T> {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...input,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    },
  };
}

export function applyKeyword<RequestBuilder extends {
  or(filters: string): RequestBuilder;
}>(request: RequestBuilder, keyword?: string): RequestBuilder {
  const value = keyword?.replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/gu, " ").trim();
  return value
    ? request.or(`code.ilike.%${value}%,name.ilike.%${value}%`)
    : request;
}

export function applyVisibility<RequestBuilder extends {
  eq(column: string, value: unknown): RequestBuilder;
  is(column: string, value: null): RequestBuilder;
  or(filters: string): RequestBuilder;
}>(request: RequestBuilder, visibility: CatalogVisibility): RequestBuilder {
  if (visibility.kind === "platform") {
    return request.eq("ownership_scope", "platform")
      .is("owner_tenant_id", null);
  }
  return request.or(
    "and(ownership_scope.eq.platform,owner_tenant_id.is.null)," +
      "and(ownership_scope.eq.tenant,owner_tenant_id.eq." +
      `${visibility.tenantId})`,
  );
}

export function applyListVisibility<RequestBuilder extends {
  eq(column: string, value: unknown): RequestBuilder;
  is(column: string, value: null): RequestBuilder;
  or(filters: string): RequestBuilder;
}>(
  request: RequestBuilder,
  visibility: CatalogVisibility,
  status?: "active" | "inactive",
): RequestBuilder {
  const effectiveStatus = visibility.kind === "tenant"
    ? status ?? "active"
    : status;
  if (visibility.kind === "tenant" && effectiveStatus === "inactive") {
    return request.eq("ownership_scope", "tenant")
      .eq("owner_tenant_id", visibility.tenantId)
      .eq("status", "inactive");
  }
  const scoped = applyVisibility(request, visibility);
  return effectiveStatus ? scoped.eq("status", effectiveStatus) : scoped;
}

export function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export function parseRow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export function compact(input: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
