import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  SUPPLIER_PURCHASE_BATCH_ITEM_SELECT,
  SUPPLIER_PURCHASE_BATCH_SELECT,
  SupplierPurchaseBatchCatalogResultSchema,
  SupplierPurchaseBatchCostCategorySchema,
  SupplierPurchaseBatchDetailSchema,
  SupplierPurchaseBatchItemSchema,
  SupplierPurchaseBatchOrderSchema,
  SupplierPurchaseBatchProjectOptionSchema,
  SupplierPurchaseBatchRequisitionSchema,
  type SupplierPurchaseBatchCatalogItem,
  type SupplierPurchaseBatchCostCategory,
  type SupplierPurchaseBatchDetail,
  type SupplierPurchaseBatchItem,
  type SupplierPurchaseBatchOrder,
  type SupplierPurchaseBatchProjectOption,
  type SupplierPurchaseBatchRequisition,
} from "@/repositories/supplier-purchase-batch-records";
import {
  SUPPLIER_PURCHASE_ORDER_SELECT,
} from "@/repositories/supplier-purchase-order-records";
import {
  SUPPLIER_PURCHASE_REQUISITION_SELECT,
} from "@/repositories/supplier-purchase-requisition-records";
import { SupabaseDB } from "@/utils/supabase";

export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type PageInput = { page: number; pageSize: number };
export type BatchListInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
  status?: string;
  project_id?: string;
};
export type BatchChildPageInput = PageInput & {
  tenant_id: string;
  batch_id: string;
};
export type BatchCatalogInput = PageInput & {
  tenant_id: string;
  project_id: string;
  keyword?: string;
  category_id?: string;
  brand_id?: string;
  tenant_supplier_id?: string;
  priced_at: string;
};
export type BatchProjectOptionInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
};
export type BatchCostCategoryInput = PageInput & {
  tenant_id: string;
  keyword?: string;
};

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type SingleResult = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: readonly string[]) => Query;
  or: (filter: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  maybeSingle: () => Promise<SingleResult>;
  then: Promise<QueryResult>["then"];
};
type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<SingleResult>;
};

export class SupplierPurchaseBatchesRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listBatches(
    input: BatchListInput,
  ): Promise<Page<SupplierPurchaseBatchDetail>> {
    const pagination = normalizePage(input);
    if (scopeIsEmpty(input.visible_project_ids, input.project_id)) {
      return toPage([], pagination, 0);
    }

    let request = this.client.from("supplier_purchase_batches")
      .select(SUPPLIER_PURCHASE_BATCH_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id);
    if (input.project_id) {
      request = request.eq("project_id", input.project_id);
    } else if (input.visible_project_ids) {
      request = request.in("project_id", input.visible_project_ids);
    }
    if (input.status) request = request.eq("status", input.status);
    request = applyKeyword(
      request,
      input.keyword,
      ["batch_no", "reason"],
    );
    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商采购批次失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseBatchDetailSchema,
        data,
        "查询供应商采购批次失败",
      ),
      pagination,
      count,
    );
  }

  async findBatch(
    tenantId: string,
    batchId: string,
  ): Promise<SupplierPurchaseBatchDetail | null> {
    const { data, error } = await this.client.from("supplier_purchase_batches")
      .select(SUPPLIER_PURCHASE_BATCH_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", batchId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商采购批次失败", error);
    return data === null
      ? null
      : parse(
        SupplierPurchaseBatchDetailSchema,
        data,
        "查询供应商采购批次失败",
      );
  }

  async listItems(
    input: BatchChildPageInput,
  ): Promise<Page<SupplierPurchaseBatchItem>> {
    return this.listChild({
      input,
      table: "supplier_purchase_batch_items",
      select: SUPPLIER_PURCHASE_BATCH_ITEM_SELECT,
      schema: SupplierPurchaseBatchItemSchema,
      message: "查询供应商采购批次明细失败",
      order: ["line_no", "id"],
    });
  }

  async listRequisitions(
    input: BatchChildPageInput,
  ): Promise<Page<SupplierPurchaseBatchRequisition>> {
    return this.listChild({
      input,
      table: "supplier_purchase_requisitions",
      select: SUPPLIER_PURCHASE_REQUISITION_SELECT,
      schema: SupplierPurchaseBatchRequisitionSchema,
      message: "查询采购批次申请失败",
      order: ["updated_at", "id"],
      descending: true,
    });
  }

  async listOrders(
    input: BatchChildPageInput,
  ): Promise<Page<SupplierPurchaseBatchOrder>> {
    return this.listChild({
      input,
      table: "supplier_purchase_orders",
      select: SUPPLIER_PURCHASE_ORDER_SELECT,
      schema: SupplierPurchaseBatchOrderSchema,
      message: "查询采购批次采购单失败",
      order: ["updated_at", "id"],
      descending: true,
    });
  }

  async listCatalog(
    input: BatchCatalogInput,
  ): Promise<Page<SupplierPurchaseBatchCatalogItem>> {
    const pagination = normalizePage(input);
    const { data, error } = await this.client.rpc(
      "resolve_supplier_purchase_batch_catalog",
      {
        p_tenant_id: input.tenant_id,
        p_project_id: input.project_id,
        p_keyword: input.keyword?.trim() || null,
        p_category_id: input.category_id ?? null,
        p_brand_id: input.brand_id ?? null,
        p_tenant_supplier_id: input.tenant_supplier_id ?? null,
        p_priced_at: input.priced_at,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(error, "查询供应商采购批次目录失败");
    }
    const result = parse(
      SupplierPurchaseBatchCatalogResultSchema,
      data,
      "查询供应商采购批次目录失败",
    );
    return toPage(
      result.items,
      { page: result.page, pageSize: result.page_size },
      result.total,
    );
  }

  async listProjectOptions(
    input: BatchProjectOptionInput,
  ): Promise<Page<SupplierPurchaseBatchProjectOption>> {
    const pagination = normalizePage(input);
    if (input.visible_project_ids?.length === 0) {
      return toPage([], pagination, 0);
    }
    let request = this.client.from("projects")
      .select("id,name,status", { count: "exact" })
      .eq("tenant_id", input.tenant_id);
    if (input.visible_project_ids) {
      request = request.in("id", input.visible_project_ids);
    }
    request = applyKeyword(request, input.keyword, ["name"]);
    const { data, error, count } = await request
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询采购批次项目选项失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseBatchProjectOptionSchema,
        data,
        "查询采购批次项目选项失败",
      ),
      pagination,
      count,
    );
  }

  async listCostCategories(
    input: BatchCostCategoryInput,
  ): Promise<Page<SupplierPurchaseBatchCostCategory>> {
    const pagination = normalizePage(input);
    let request = this.client.from("finance_cost_categories")
      .select("id,code,name,status,sort_order", { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("status", "active");
    request = applyKeyword(request, input.keyword, ["code", "name"]);
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询采购批次成本分类失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseBatchCostCategorySchema,
        data,
        "查询采购批次成本分类失败",
      ),
      pagination,
      count,
    );
  }

  private async listChild<T>(input: {
    input: BatchChildPageInput;
    table: string;
    select: string;
    schema: z.ZodType<T>;
    message: string;
    order: [string, string];
    descending?: boolean;
  }): Promise<Page<T>> {
    const pagination = normalizePage(input.input);
    const ascending = !input.descending;
    const { data, error, count } = await this.client.from(input.table)
      .select(input.select, { count: "exact" })
      .eq("tenant_id", input.input.tenant_id)
      .eq("purchase_batch_id", input.input.batch_id)
      .order(input.order[0], { ascending })
      .order(input.order[1], { ascending })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError(input.message, error);
    return toPage(
      parseRows(input.schema, data, input.message),
      pagination,
      count,
    );
  }
}

function scopeIsEmpty(
  visibleProjectIds: string[] | null,
  projectId?: string,
): boolean {
  return visibleProjectIds?.length === 0 || Boolean(
    projectId &&
      visibleProjectIds &&
      !visibleProjectIds.includes(projectId),
  );
}

function normalizePage(input: PageInput): PageInput {
  return {
    page: input.page > 0 ? input.page : 1,
    pageSize: Math.min(Math.max(input.pageSize, 1), 100),
  };
}

function pageRange(input: PageInput): [number, number] {
  const start = (input.page - 1) * input.pageSize;
  return [start, start + input.pageSize - 1];
}

function applyKeyword(
  request: Query,
  keyword: string | undefined,
  columns: readonly string[],
): Query {
  const safe = keyword
    ?.trim()
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return safe
    ? request.or(columns.map((column) => `${column}.ilike.%${safe}%`).join(","))
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

function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  return parse(z.array(schema), data ?? [], message);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPurchaseBatchesRepository =
  new SupplierPurchaseBatchesRepository();
