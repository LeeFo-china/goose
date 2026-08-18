import { SUPPLIER_PRICE_LIST_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import { SupabaseDB } from "@/utils/supabase";

const PRICE_LIST_SELECT = [
  "id",
  "supplier_id",
  "price_list_code",
  "version_number",
  "scope_type",
  "name",
  "currency",
  "lifecycle_status",
  "effective_from",
  "effective_until",
  "supersedes_price_list_id",
  "published_at",
  "row_version",
  "updated_at",
].join(",");
const PRICE_ITEM_SELECT = [
  "id",
  "supplier_id",
  "supplier_price_list_id",
  "supplier_sku_id",
  "minimum_quantity::text",
  "maximum_quantity::text",
  "purchase_unit_id",
  "base_unit_id",
  "base_unit_conversion::text",
  "unit_price::text",
  "tax_rate::text",
  "tax_inclusive",
  "sku:supplier_skus!supplier_sku_id(id,sku_code,name,status)",
  "purchase_unit:catalog_units!purchase_unit_id(id,code,name,symbol,status)",
  "base_unit:catalog_units!base_unit_id(id,code,name,symbol,status)",
  "updated_at",
].join(",");

const PriceListSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  price_list_code: z.string(),
  version_number: z.number().int().positive(),
  scope_type: z.literal("default"),
  name: z.string(),
  currency: z.string(),
  lifecycle_status: z.enum(SUPPLIER_PRICE_LIST_STATUS_VALUES),
  effective_from: z.string(),
  effective_until: z.string().nullable(),
  supersedes_price_list_id: z.uuid().nullable(),
  published_at: z.string().nullable(),
  row_version: z.number().int().positive(),
  updated_at: z.string(),
}).strict();
const ResourceReferenceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  status: z.enum(["active", "inactive"]),
}).strict();
const PriceItemSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  supplier_price_list_id: z.uuid(),
  supplier_sku_id: z.uuid(),
  minimum_quantity: z.string(),
  maximum_quantity: z.string().nullable(),
  purchase_unit_id: z.uuid(),
  base_unit_id: z.uuid(),
  base_unit_conversion: z.string(),
  unit_price: z.string(),
  tax_rate: z.string(),
  tax_inclusive: z.boolean(),
  sku: z.object({
    id: z.uuid(),
    sku_code: z.string(),
    name: z.string(),
    status: z.enum(["draft", "active", "inactive"]),
  }).strict(),
  purchase_unit: ResourceReferenceSchema,
  base_unit: ResourceReferenceSchema,
  updated_at: z.string(),
}).strict();
const PriceCommandResultSchema = z.object({
  status: z.string(),
  idempotent: z.boolean().optional(),
  price_list: z.record(z.string(), z.unknown()).optional(),
  item: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().nonnegative().optional(),
  current_status: z.string().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

export type SupplierPriceList = z.infer<typeof PriceListSchema>;
export type SupplierPriceItem = z.infer<typeof PriceItemSchema>;
export type SupplierPriceCommandResult =
  z.infer<typeof PriceCommandResultSchema>;
export type SupplierPriceListPage = Page<SupplierPriceList>;
export type SupplierPriceItemPage = Page<SupplierPriceItem>;

type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type PageInput = { page: number; pageSize: number };
export type SupplierPriceListInput = PageInput & {
  supplier_id: string;
  tenant_id: string;
  keyword?: string;
  lifecycle_status?: string;
};
export type SupplierPriceItemInput = PageInput & {
  supplier_id: string;
  tenant_id: string;
  price_list_id: string;
};
export type PriceCommandContext = {
  supplier_id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
  proxy_reason: string;
};

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

export class SupplierPriceListsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listPriceLists(input: SupplierPriceListInput) {
    const pagination = normalizePage(input);
    let request = this.client.from("supplier_price_lists")
      .select(PRICE_LIST_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id)
      .eq("tenant_id", input.tenant_id);
    if (input.lifecycle_status) {
      request = request.eq("lifecycle_status", input.lifecycle_status);
    }
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("effective_from", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商价格簿失败", error);
    return toPage(
      parseRows(PriceListSchema, data, "查询供应商价格簿失败"),
      pagination,
      count,
    );
  }

  async findPriceList(supplierId: string, priceListId: string, tenantId: string) {
    const { data, error } = await this.client.from("supplier_price_lists")
      .select(PRICE_LIST_SELECT)
      .eq("supplier_id", supplierId)
      .eq("tenant_id", tenantId)
      .eq("id", priceListId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商价格簿失败", error);
    return data === null
      ? null
      : parse(PriceListSchema, data, "查询供应商价格簿失败");
  }

  async listItems(input: SupplierPriceItemInput) {
    const pagination = normalizePage(input);
    const { data, error, count } = await this.client
      .from("supplier_price_list_items")
      .select(PRICE_ITEM_SELECT, { count: "exact" })
      .eq("supplier_id", input.supplier_id)
      .eq("tenant_id", input.tenant_id)
      .eq("supplier_price_list_id", input.price_list_id)
      .order("supplier_sku_id", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商价格条目失败", error);
    return toPage(
      parseRows(PriceItemSchema, data, "查询供应商价格条目失败"),
      pagination,
      count,
    );
  }

  create(input: PriceCommandContext & Record<string, unknown>) {
    return this.command(
      "create_supplier_price_list",
      rpcParams(input),
      "创建供应商价格簿失败",
    );
  }

  publish(input: PriceCommandContext & Record<string, unknown>) {
    return this.command(
      "publish_supplier_price_list",
      rpcParams(input),
      "发布供应商价格簿失败",
    );
  }

  createVersion(input: PriceCommandContext & Record<string, unknown>) {
    return this.command(
      "create_supplier_price_list_version",
      rpcParams(input),
      "创建供应商价格簿新版本失败",
    );
  }

  retire(input: PriceCommandContext & Record<string, unknown>) {
    return this.command(
      "retire_supplier_price_list",
      rpcParams(input),
      "退役供应商价格簿失败",
    );
  }

  upsertItem(input: PriceCommandContext & {
    item_id: string;
    price_list_id: string;
    sku_id: string;
    unit_price: number;
    tax_rate: number;
    tax_inclusive: boolean;
    expected_version: number;
  }) {
    return this.command(
      "upsert_supplier_price_list_item",
      rpcParams(input),
      "保存供应商价格条目失败",
    );
  }

  deleteItem(input: PriceCommandContext & {
    item_id: string;
    price_list_id: string;
    expected_version: number;
  }) {
    return this.command(
      "delete_supplier_price_list_item",
      rpcParams(input),
      "删除供应商价格条目失败",
    );
  }

  async updateDraft(input: Record<string, unknown> & {
    supplier_id: string;
    tenant_id: string;
    price_list_id: string;
    expected_version: number;
  }) {
    const {
      supplier_id,
      tenant_id,
      price_list_id,
      expected_version,
      ...fields
    } = input;
    const { data, error } = await this.client.from("supplier_price_lists")
      .update({ ...fields, row_version: expected_version + 1 })
      .eq("supplier_id", supplier_id)
      .eq("tenant_id", tenant_id)
      .eq("id", price_list_id)
      .eq("lifecycle_status", "draft")
      .eq("row_version", expected_version)
      .select(PRICE_LIST_SELECT)
      .maybeSingle();
    if (error) {
      throwSupplierCommandDatabaseError(error, "更新供应商价格簿失败");
    }
    if (data === null) {
      throw Errors.business(
        409,
        "供应商价格簿版本已变化",
        "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
      );
    }
    return parse(PriceListSchema, data, "更新供应商价格簿失败");
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);
    return parse(PriceCommandResultSchema, data, message);
  }
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
    ? request.or(`price_list_code.ilike.%${safe}%,name.ilike.%${safe}%`)
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

export const supplierPriceListsRepository =
  new SupplierPriceListsRepository();
