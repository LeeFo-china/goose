import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from
  "@/repositories/supplier-command-errors";
import { SupabaseDB } from "@/utils/supabase";

const CategoryOptionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  full_name: z.string(),
  status: z.literal("active"),
}).strict();

const CategoryOptionResultSchema = z.object({
  items: z.array(CategoryOptionSchema).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();

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

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};

export class SupplierPurchaseBatchCatalogRepository {
  constructor(
    private readonly client: Client =
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async listCategoryOptions(
    input: SupplierPurchaseBatchCategoryOptionInput,
  ): Promise<SupplierPurchaseBatchCategoryOptionPage> {
    const pagination = normalizePage(input);
    const { data, error } = await this.client.rpc(
      "resolve_supplier_purchase_batch_category_options",
      {
        p_tenant_id: input.tenant_id,
        p_priced_at: input.priced_at,
        p_keyword: input.keyword?.trim() || null,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(
        error,
        "查询采购批次目录分类失败",
      );
    }
    const parsed = CategoryOptionResultSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("查询采购批次目录分类失败", parsed.error.issues);
    }
    const result = parsed.data;
    return {
      list: result.items,
      pagination: {
        page: result.page,
        pageSize: result.page_size,
        total: result.total,
        totalPages: result.total === 0
          ? 0
          : Math.ceil(result.total / result.page_size),
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

export const supplierPurchaseBatchCatalogRepository =
  new SupplierPurchaseBatchCatalogRepository();
