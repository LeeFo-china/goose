import {
  SUPPLIER_PRODUCT_STATUS_VALUES,
  SUPPLIER_SKU_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export const PRODUCT_SELECT = [
  "id",
  "supplier_id",
  "product_code",
  "name",
  "description",
  "status",
  "version",
  "ownership_scope",
  "owner_tenant_id",
  "category:catalog_categories!category_id(id,code,name,status)",
  "brand:catalog_brands!brand_id(id,code,name,status)",
  "updated_at",
].join(",");

export const SKU_SELECT = [
  "id",
  "supplier_id",
  "supplier_product_id",
  "sku_code",
  "name",
  "specification",
  "model",
  "spec_values",
  "purchase_unit_id",
  "base_unit_id",
  "base_unit_conversion::text",
  "batch_managed",
  "color_managed",
  "serial_managed",
  "status",
  "version",
  "ownership_scope",
  "owner_tenant_id",
  "purchase_unit:catalog_units!purchase_unit_id(id,code,name,symbol,status)",
  "base_unit:catalog_units!base_unit_id(id,code,name,symbol,status)",
  "updated_at",
].join(",");

export const SKU_UNIT_CONVERSION_SELECT = [
  "from_unit_id",
  "to_unit_id",
  "factor::text",
  "from_unit:catalog_units!supplier_sku_unit_conversions_from_unit_id_fkey(id,code,name,symbol,unit_dimension)",
  "to_unit:catalog_units!supplier_sku_unit_conversions_to_unit_id_fkey(id,code,name,symbol,unit_dimension)",
].join(",");

const CatalogReferenceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
}).strict();

const UnitReferenceSchema = CatalogReferenceSchema.extend({
  symbol: z.string(),
}).strict();

const ConversionUnitReferenceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  unit_dimension: z.string(),
}).strict();

export const ProductSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  product_code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(SUPPLIER_PRODUCT_STATUS_VALUES),
  version: z.number().int().positive(),
  ownership_scope: z.enum(["platform", "tenant"]),
  owner_tenant_id: z.uuid().nullable(),
  category: CatalogReferenceSchema,
  brand: CatalogReferenceSchema,
  updated_at: z.string(),
}).strict();

const SpecValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const SkuSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  supplier_product_id: z.uuid(),
  sku_code: z.string(),
  name: z.string(),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  // Historical rows may remain NULL by design; new writes are guarded as objects.
  spec_values: z.record(z.string(), SpecValueSchema).nullable(),
  purchase_unit_id: z.uuid(),
  base_unit_id: z.uuid(),
  base_unit_conversion: z.string(),
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  status: z.enum(SUPPLIER_SKU_STATUS_VALUES),
  version: z.number().int().positive(),
  ownership_scope: z.enum(["platform", "tenant"]),
  owner_tenant_id: z.uuid().nullable(),
  purchase_unit: UnitReferenceSchema,
  base_unit: UnitReferenceSchema,
  updated_at: z.string(),
}).strict();

export const SkuUnitConversionSchema = z.object({
  from_unit_id: z.uuid(),
  to_unit_id: z.uuid(),
  factor: z.string(),
  from_unit: ConversionUnitReferenceSchema,
  to_unit: ConversionUnitReferenceSchema,
}).strict();

export const ProductCommandResultSchema = z.object({
  status: z.string(),
  idempotent: z.boolean().optional(),
  product: z.record(z.string(), z.unknown()).optional(),
  sku: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().nonnegative().optional(),
  current_status: z.string().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

export type SupplierProduct = z.infer<typeof ProductSchema>;
export type SupplierSku = z.infer<typeof SkuSchema>;
export type SupplierSkuUnitConversion = z.infer<
  typeof SkuUnitConversionSchema
>;
export type SupplierProductCommandResult =
  z.infer<typeof ProductCommandResultSchema>;

export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PageInput = { page: number; pageSize: number };
export type Result = { data: unknown; error: unknown; count: number | null };
export type SingleResult = { data: unknown; error: unknown };

export type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  is: (column: string, value: null) => Query;
  or: (value: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  limit: (count: number) => Query;
  maybeSingle: () => Promise<SingleResult>;
  then: Promise<Result>["then"];
};

export type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<SingleResult>;
};

export function normalizePage(input: PageInput): PageInput {
  return {
    page: input.page > 0 ? input.page : 1,
    pageSize: Math.min(Math.max(input.pageSize, 1), 100),
  };
}

export function pageRange(input: PageInput): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
}

function applyKeyword(
  request: Query,
  codeColumn: "product_code" | "sku_code",
  keyword?: string,
): Query {
  const safe = keyword?.trim().replace(/[%_,().]/g, "");
  return safe
    ? request.or(`${codeColumn}.ilike.%${safe}%,name.ilike.%${safe}%`)
    : request;
}

export function applyProductKeyword(request: Query, keyword?: string): Query {
  return applyKeyword(request, "product_code", keyword);
}

export function applySkuKeyword(request: Query, keyword?: string): Query {
  return applyKeyword(request, "sku_code", keyword);
}

export function tenantReadScopeFilter(tenantId: string): string {
  return [
    "ownership_scope.eq.platform",
    `and(ownership_scope.eq.tenant,owner_tenant_id.eq.${tenantId})`,
  ].join(",");
}

export function toPage<T>(
  list: T[],
  pagination: PageInput,
  count: number | null,
): Page<T> {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...pagination,
      total,
      totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
    },
  };
}

export function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  return parse(z.array(schema), data ?? [], message);
}

export function parse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}
