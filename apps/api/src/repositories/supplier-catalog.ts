import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  CatalogBrandCreateRecord,
  CatalogBrandListQuery,
  CatalogBrandUpdateRecord,
  CatalogCategoryCreateRecord,
  CatalogCategoryListQuery,
  CatalogCategoryUpdateRecord,
  CatalogUnitCreateRecord,
  CatalogUnitListQuery,
  CatalogUnitUpdateRecord,
} from "@/schema/supplier-catalog";
import { SupabaseDB } from "@/utils/supabase";

const CATEGORY_SELECT =
  "id,parent_id,code,name,level,status,sort_order,version,created_at,updated_at";
const BRAND_SELECT =
  "id,code,name,legal_name,logo_file_id,status,sort_order,version,created_at,updated_at";
const UNIT_SELECT =
  "id,code,name,symbol,base_unit_id,conversion_factor::text,status,sort_order,version,created_at,updated_at";

const CatalogStatusSchema = z.enum(["active", "inactive"]);
const catalogAudit = {
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
};
const CatalogCategorySchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  level: z.number().int().min(1).max(6),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...catalogAudit,
}).strict();
const CatalogBrandSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string().nullable(),
  logo_file_id: z.uuid().nullable(),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...catalogAudit,
}).strict();
const CatalogUnitSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  base_unit_id: z.uuid().nullable(),
  conversion_factor: z.string(),
  status: CatalogStatusSchema,
  sort_order: z.number().int(),
  ...catalogAudit,
}).strict();

export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;
export type CatalogBrand = z.infer<typeof CatalogBrandSchema>;
export type CatalogUnit = z.infer<typeof CatalogUnitSchema>;
export type CatalogPage<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export interface SupplierCatalogRepositoryPort {
  listCategories(
    query: CatalogCategoryListQuery,
  ): Promise<CatalogPage<CatalogCategory>>;
  listBrands(query: CatalogBrandListQuery): Promise<CatalogPage<CatalogBrand>>;
  listUnits(query: CatalogUnitListQuery): Promise<CatalogPage<CatalogUnit>>;
  createCategory(input: CatalogCategoryCreateRecord): Promise<CatalogCategory>;
  updateCategory(input: CatalogCategoryUpdateRecord): Promise<CatalogCategory>;
  createBrand(input: CatalogBrandCreateRecord): Promise<CatalogBrand>;
  updateBrand(input: CatalogBrandUpdateRecord): Promise<CatalogBrand>;
  createUnit(input: CatalogUnitCreateRecord): Promise<CatalogUnit>;
  updateUnit(input: CatalogUnitUpdateRecord): Promise<CatalogUnit>;
}

type CatalogClient = ReturnType<typeof SupabaseDB.getAdminClient>;

export class SupplierCatalogRepository
  implements SupplierCatalogRepositoryPort {
  private readonly client: CatalogClient;

  constructor(clientFactory = () => SupabaseDB.getAdminClient()) {
    this.client = clientFactory();
  }

  async listCategories(
    input: CatalogCategoryListQuery,
  ): Promise<CatalogPage<CatalogCategory>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_categories")
      .select(CATEGORY_SELECT, { count: "exact" });
    request = input.parent_id
      ? request.eq("parent_id", input.parent_id)
      : request.is("parent_id", null);
    if (input.status) request = request.eq("status", input.status);
    if (input.level) request = request.eq("level", input.level);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询标准目录分类失败", error);
    return toPage(
      parseRows(CatalogCategorySchema, data, "查询标准目录分类失败"),
      pagination,
      count,
    );
  }

  async listBrands(
    input: CatalogBrandListQuery,
  ): Promise<CatalogPage<CatalogBrand>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_brands")
      .select(BRAND_SELECT, { count: "exact" });
    if (input.status) request = request.eq("status", input.status);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询标准品牌失败", error);
    return toPage(
      parseRows(CatalogBrandSchema, data, "查询标准品牌失败"),
      pagination,
      count,
    );
  }

  async listUnits(
    input: CatalogUnitListQuery,
  ): Promise<CatalogPage<CatalogUnit>> {
    const pagination = normalizePage(input);
    const { start, end } = pageRange(pagination);
    let request = this.client.from("catalog_units")
      .select(UNIT_SELECT, { count: "exact" });
    if (input.status) request = request.eq("status", input.status);
    if (input.base_unit_id === null) {
      request = request.is("base_unit_id", null);
    } else if (input.base_unit_id) {
      request = request.eq("base_unit_id", input.base_unit_id);
    }
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw Errors.dbError("查询标准单位失败", error);
    return toPage(
      parseRows(CatalogUnitSchema, data, "查询标准单位失败"),
      pagination,
      count,
    );
  }

  createCategory(input: CatalogCategoryCreateRecord) {
    return this.createRow(
      "catalog_categories",
      CATEGORY_SELECT,
      input,
      CatalogCategorySchema,
      "新增标准目录分类失败",
    );
  }

  updateCategory(input: CatalogCategoryUpdateRecord) {
    const { category_id, expected_version, ...patch } = input;
    return this.updateRow(
      "catalog_categories",
      CATEGORY_SELECT,
      category_id,
      expected_version,
      patch,
      CatalogCategorySchema,
      "更新标准目录分类失败",
    );
  }

  createBrand(input: CatalogBrandCreateRecord) {
    return this.createRow(
      "catalog_brands",
      BRAND_SELECT,
      input,
      CatalogBrandSchema,
      "新增标准品牌失败",
    );
  }

  updateBrand(input: CatalogBrandUpdateRecord) {
    const { brand_id, expected_version, ...patch } = input;
    return this.updateRow(
      "catalog_brands",
      BRAND_SELECT,
      brand_id,
      expected_version,
      patch,
      CatalogBrandSchema,
      "更新标准品牌失败",
    );
  }

  createUnit(input: CatalogUnitCreateRecord) {
    return this.createRow(
      "catalog_units",
      UNIT_SELECT,
      input,
      CatalogUnitSchema,
      "新增标准单位失败",
    );
  }

  updateUnit(input: CatalogUnitUpdateRecord) {
    const { unit_id, expected_version, ...patch } = input;
    return this.updateRow(
      "catalog_units",
      UNIT_SELECT,
      unit_id,
      expected_version,
      patch,
      CatalogUnitSchema,
      "更新标准单位失败",
    );
  }

  private async createRow<T>(
    table: string,
    select: string,
    input: object,
    schema: z.ZodType<T>,
    message: string,
  ): Promise<T> {
    const { data, error } = await this.client.from(table)
      .insert(compact(input))
      .select(select)
      .maybeSingle();
    if (error) throw Errors.dbError(message, error);
    return parseRow(schema, data, message);
  }

  private async updateRow<T>(
    table: string,
    select: string,
    id: string,
    expectedVersion: number,
    patch: object,
    schema: z.ZodType<T>,
    message: string,
  ): Promise<T> {
    const { data, error } = await this.client.from(table)
      .update(compact({ ...patch, version: expectedVersion + 1 }))
      .eq("id", id)
      .eq("version", expectedVersion)
      .select(select)
      .maybeSingle();
    if (error) throw Errors.dbError(message, error);
    if (data === null) {
      throw Errors.business(
        409,
        "目录数据版本已变化，请刷新后重试",
        "SUPPLIER_VERSION_CONFLICT",
      );
    }
    return parseRow(schema, data, message);
  }
}

function normalizePage(input: { page: number; pageSize: number }) {
  return {
    page: Number.isInteger(input.page) && input.page > 0 ? input.page : 1,
    pageSize: Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(100, input.pageSize)
      : 20,
  };
}

function pageRange(input: { page: number; pageSize: number }) {
  const start = (input.page - 1) * input.pageSize;
  return { start, end: start + input.pageSize - 1 };
}

function toPage<T>(
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

function applyKeyword<RequestBuilder extends {
  or(filters: string): RequestBuilder;
}>(request: RequestBuilder, keyword?: string): RequestBuilder {
  const value = keyword?.replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return value
    ? request.or(`code.ilike.%${value}%,name.ilike.%${value}%`)
    : request;
}

function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function parseRow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function compact(input: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

export const supplierCatalogRepository = new SupplierCatalogRepository();
