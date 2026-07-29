import {
  SUPPLIER_PRODUCT_STATUS_VALUES,
  SUPPLIER_SKU_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const PRODUCT_LIST_SELECT = [
  "id",
  "supplier_id",
  "product_code",
  "name",
  "description",
  "status",
  "version",
  "category:catalog_categories!category_id(id,code,name,status)",
  "brand:catalog_brands!brand_id(id,code,name,status)",
  "updated_at",
].join(",");
const PRODUCT_RECORD_SELECT = [
  "id",
  "supplier_id",
  "product_code",
  "name",
  "category_id",
  "brand_id",
  "description",
  "status",
  "version",
  "updated_at",
].join(",");
const SKU_LIST_SELECT = [
  "id",
  "supplier_id",
  "supplier_product_id",
  "sku_code",
  "name",
  "specification",
  "model",
  "purchase_unit_id",
  "base_unit_id",
  "base_unit_conversion::text",
  "batch_managed",
  "color_managed",
  "serial_managed",
  "status",
  "version",
  "purchase_unit:catalog_units!purchase_unit_id(id,code,name,symbol,status)",
  "base_unit:catalog_units!base_unit_id(id,code,name,symbol,status)",
  "updated_at",
].join(",");
const SKU_RECORD_SELECT = [
  "id",
  "supplier_id",
  "supplier_product_id",
  "sku_code",
  "name",
  "specification",
  "model",
  "purchase_unit_id",
  "base_unit_id",
  "base_unit_conversion::text",
  "batch_managed",
  "color_managed",
  "serial_managed",
  "status",
  "version",
  "updated_at",
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
const ProductSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  product_code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(SUPPLIER_PRODUCT_STATUS_VALUES),
  version: z.number().int().positive(),
  category: CatalogReferenceSchema,
  brand: CatalogReferenceSchema,
  updated_at: z.string(),
}).strict();
const ProductRecordSchema = ProductSchema.omit({
  category: true,
  brand: true,
}).extend({
  category_id: z.uuid(),
  brand_id: z.uuid(),
}).passthrough();
const SkuSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  supplier_product_id: z.uuid(),
  sku_code: z.string(),
  name: z.string(),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  purchase_unit_id: z.uuid(),
  base_unit_id: z.uuid(),
  base_unit_conversion: z.string(),
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  status: z.enum(SUPPLIER_SKU_STATUS_VALUES),
  version: z.number().int().positive(),
  purchase_unit: UnitReferenceSchema,
  base_unit: UnitReferenceSchema,
  updated_at: z.string(),
}).strict();
const SkuRecordSchema = SkuSchema.omit({
  purchase_unit: true,
  base_unit: true,
}).passthrough();
const ProductCommandResultSchema = z.object({
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
export type SupplierProductCommandResult =
  z.infer<typeof ProductCommandResultSchema>;
export type SupplierProductPage = Page<SupplierProduct>;
export type SupplierSkuPage = Page<SupplierSku>;

export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type SupplierProductListInput = PageInput & {
  supplier_id: string;
  keyword?: string;
  status?: string;
  category_id?: string;
  brand_id?: string;
};
export type SupplierSkuListInput = PageInput & {
  supplier_id: string;
  supplier_product_id: string;
  keyword?: string;
  status?: string;
};
export type SupplierCommandContext = {
  supplier_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
  proxy_reason: string;
};
export type SupplierProductCreateCommand = SupplierCommandContext & {
  product_id: string;
  product_code: string;
  name: string;
  category_id: string;
  brand_id: string;
  description?: string | null;
};

type PageInput = { page: number; pageSize: number };
type Result = { data: unknown; error: unknown; count: number | null };
type SingleResult = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  update: (value: Record<string, unknown>) => Query;
  eq: (column: string, value: unknown) => Query;
  or: (value: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  maybeSingle: () => Promise<SingleResult>;
  then: Promise<Result>["then"];
};
type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<SingleResult>;
};

export class SupplierProductsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listProducts(input: SupplierProductListInput) {
    const pagination = normalizePage(input);
    let request = this.client.from("supplier_products")
      .select(PRODUCT_LIST_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id);
    if (input.status) request = request.eq("status", input.status);
    if (input.category_id) {
      request = request.eq("category_id", input.category_id);
    }
    if (input.brand_id) request = request.eq("brand_id", input.brand_id);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商商品失败", error);
    return toPage(
      parseRows(ProductSchema, data, "查询供应商商品失败"),
      pagination,
      count,
    );
  }

  async findProduct(supplierId: string, productId: string) {
    const { data, error } = await this.client.from("supplier_products")
      .select(PRODUCT_LIST_SELECT)
      .eq("supplier_id", supplierId)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商商品失败", error);
    return data === null
      ? null
      : parse(ProductSchema, data, "查询供应商商品失败");
  }

  async listSkus(input: SupplierSkuListInput) {
    const pagination = normalizePage(input);
    let request = this.client.from("supplier_skus")
      .select(SKU_LIST_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id)
      .eq("supplier_product_id", input.supplier_product_id);
    if (input.status) request = request.eq("status", input.status);
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商 SKU 失败", error);
    return toPage(
      parseRows(SkuSchema, data, "查询供应商 SKU 失败"),
      pagination,
      count,
    );
  }

  createProduct(input: SupplierProductCreateCommand) {
    return this.command("create_supplier_product", {
      p_product_id: input.product_id,
      p_tenant_id: input.tenant_id,
      p_supplier_id: input.supplier_id,
      p_product_code: input.product_code,
      p_name: input.name,
      p_category_id: input.category_id,
      p_brand_id: input.brand_id,
      p_description: input.description ?? null,
      ...commandParams(input),
    }, "创建供应商商品失败");
  }

  createSku(input: SupplierCommandContext & Record<string, unknown>) {
    return this.command("create_supplier_sku", rpcParams(input), "创建供应商 SKU 失败");
  }

  mutateProduct(input: SupplierCommandContext & Record<string, unknown>) {
    return this.command(
      "mutate_supplier_product",
      rpcParams(input),
      "变更供应商商品状态失败",
    );
  }

  mutateSku(input: SupplierCommandContext & Record<string, unknown>) {
    return this.command(
      "mutate_supplier_sku",
      rpcParams(input),
      "变更供应商 SKU 状态失败",
    );
  }

  async updateProduct(input: Record<string, unknown> & {
    supplier_id: string;
    product_id: string;
    expected_version: number;
  }) {
    const {
      supplier_id,
      product_id,
      expected_version,
      ...fields
    } = input;
    const { data, error } = await this.client.from("supplier_products")
      .update({ ...fields, version: expected_version + 1 })
      .eq("supplier_id", supplier_id)
      .eq("id", product_id)
      .eq("version", expected_version)
      .select(PRODUCT_RECORD_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新供应商商品失败", error);
    if (data === null) throw versionConflict("供应商商品版本已变化");
    return parse(ProductRecordSchema, data, "更新供应商商品失败");
  }

  async updateSku(input: Record<string, unknown> & {
    supplier_id: string;
    sku_id: string;
    expected_version: number;
  }) {
    const { supplier_id, sku_id, expected_version, ...fields } = input;
    const { data, error } = await this.client.from("supplier_skus")
      .update({ ...fields, version: expected_version + 1 })
      .eq("supplier_id", supplier_id)
      .eq("id", sku_id)
      .eq("version", expected_version)
      .select(SKU_RECORD_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新供应商 SKU 失败", error);
    if (data === null) throw versionConflict("供应商 SKU 版本已变化");
    return parse(SkuRecordSchema, data, "更新供应商 SKU 失败");
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw Errors.dbError(message, error);
    return parse(ProductCommandResultSchema, data, message);
  }
}

function commandParams(input: SupplierCommandContext) {
  return {
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
    p_proxy_reason: input.proxy_reason,
  };
}

function rpcParams(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key.startsWith("p_") ? key : `p_${key}`,
      value,
    ]),
  );
}

function normalizePage(input: PageInput) {
  return {
    page: input.page > 0 ? input.page : 1,
    pageSize: Math.min(Math.max(input.pageSize, 1), 100),
  };
}

function pageRange(input: PageInput): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
}

function applyKeyword(request: Query, keyword?: string) {
  const safe = keyword?.trim().replace(/[%_,().]/g, "");
  return safe
    ? request.or(`product_code.ilike.%${safe}%,name.ilike.%${safe}%`)
    : request;
}

function toPage<T>(
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

function parseRows<T>(schema: z.ZodType<T>, data: unknown, message: string) {
  return parse(z.array(schema), data ?? [], message);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function versionConflict(message: string) {
  return Errors.business(
    409,
    message,
    "SUPPLIER_PRODUCT_VERSION_CONFLICT",
  );
}

export const supplierProductsRepository = new SupplierProductsRepository();
