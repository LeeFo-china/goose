import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const CATEGORY_FIELDS = "id,code,name,full_name,status";
const PURCHASABLE_CATEGORY_SELECT = [
  CATEGORY_FIELDS,
  "_products:supplier_products!supplier_products_category_id_fkey!inner(",
  "_price_items:supplier_price_list_items!supplier_price_items_product_supplier_fkey!inner(",
  "_sku:supplier_skus!supplier_price_items_sku_supplier_fkey!inner(),",
  "_price_list:supplier_price_lists!supplier_price_items_list_tenant_supplier_fkey!inner(",
  "_relationship:tenant_suppliers!supplier_price_lists_relationship_fkey!inner(),",
  "_supplier:suppliers!supplier_price_lists_supplier_id_fkey!inner()",
  ")))",
].join("");

const CategoryOptionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  full_name: z.string(),
  status: z.literal("active"),
});

export type SupplierPurchaseBatchCategoryOption = z.infer<
  typeof CategoryOptionSchema
>;
export type SupplierPurchaseBatchCategoryOptionInput = {
  tenant_id: string;
  priced_at: string;
  page: number;
  pageSize: number;
  keyword?: string;
};
export type SupplierPurchaseBatchCategoryOptionPage = {
  list: SupplierPurchaseBatchCategoryOption[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  lte: (column: string, value: unknown) => Query;
  or: (
    filter: string,
    options?: { referencedTable?: string },
  ) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  then: Promise<QueryResult>["then"];
};
type Client = { from: (table: string) => Query };

export class SupplierPurchaseBatchCatalogRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async listCategoryOptions(
    input: SupplierPurchaseBatchCategoryOptionInput,
  ): Promise<SupplierPurchaseBatchCategoryOptionPage> {
    const pagination = normalizePage(input);
    let request = this.clientProvider().from("catalog_categories")
      .select(PURCHASABLE_CATEGORY_SELECT, { count: "exact" })
      .eq("status", "active")
      .eq("is_leaf", true)
      .or(visibleOwnership(input.tenant_id))
      .eq("_products.status", "active")
      .or(visibleOwnership(input.tenant_id), { referencedTable: "_products" })
      .eq("_products._price_items.tenant_id", input.tenant_id)
      .eq("_products._price_items._sku.status", "active")
      .or(visibleOwnership(input.tenant_id), {
        referencedTable: "_products._price_items._sku",
      })
      .eq(
        "_products._price_items._price_list.tenant_id",
        input.tenant_id,
      )
      .eq(
        "_products._price_items._price_list.lifecycle_status",
        "published",
      )
      .eq("_products._price_items._price_list.scope_type", "default")
      .eq("_products._price_items._price_list.currency", "CNY")
      .lte(
        "_products._price_items._price_list.effective_from",
        input.priced_at,
      )
      .or(`effective_until.is.null,effective_until.gt.${input.priced_at}`, {
        referencedTable: "_products._price_items._price_list",
      })
      .eq(
        "_products._price_items._price_list._relationship.tenant_id",
        input.tenant_id,
      )
      .eq(
        "_products._price_items._price_list._relationship.relationship_status",
        "active",
      )
      .eq(
        "_products._price_items._price_list._relationship.default_currency",
        "CNY",
      )
      .eq(
        "_products._price_items._price_list._supplier.onboarding_status",
        "approved",
      )
      .eq(
        "_products._price_items._price_list._supplier.operational_status",
        "active",
      )
      .or(visibleOwnership(input.tenant_id), {
        referencedTable: "_products._price_items._price_list._supplier",
      });
    request = applyKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) {
      throw Errors.dbError("查询采购批次目录分类失败", error);
    }
    const parsed = z.array(CategoryOptionSchema).safeParse(data ?? []);
    if (!parsed.success) {
      throw Errors.dbError("查询采购批次目录分类失败", parsed.error);
    }
    const total = count ?? 0;
    return {
      list: parsed.data,
      pagination: {
        ...pagination,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
      },
    };
  }
}

function normalizePage(input: { page: number; pageSize: number }) {
  return {
    page: Math.max(1, Math.floor(input.page) || 1),
    pageSize: Math.min(100, Math.max(1, Math.floor(input.pageSize) || 20)),
  };
}

function pageRange(input: { page: number; pageSize: number }): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
}

function visibleOwnership(tenantId: string) {
  return "and(ownership_scope.eq.platform,owner_tenant_id.is.null)," +
    `and(ownership_scope.eq.tenant,owner_tenant_id.eq.${tenantId})`;
}

function applyKeyword(request: Query, keyword?: string): Query {
  const value = keyword?.trim();
  if (!value) return request;
  const pattern = quotePostgrestValue(`%${escapeLike(value)}%`);
  return request.or(
    ["code", "name", "full_name"]
      .map((column) => `${column}.ilike.${pattern}`)
      .join(","),
  );
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export const supplierPurchaseBatchCatalogRepository =
  new SupplierPurchaseBatchCatalogRepository();
