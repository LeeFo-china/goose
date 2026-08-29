import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  executeSupplierPurchaseBatchCommand,
  type SupplierPurchaseBatchCommandResult,
} from "@/repositories/supplier-purchase-batch-command-gateway";
import {
  SUPPLIER_PURCHASE_BATCH_SELECT,
  SupplierPurchaseBatchCatalogResultSchema,
  SupplierPurchaseBatchCostCategorySchema,
  SupplierPurchaseBatchDetailSchema,
  SupplierPurchaseBatchProjectOptionSchema,
  type SupplierPurchaseBatchCatalogItem,
  type SupplierPurchaseBatchCostCategory,
  type SupplierPurchaseBatchDetail,
  type SupplierPurchaseBatchItem,
  type SupplierPurchaseBatchOrder,
  type SupplierPurchaseBatchProjectOption,
  type SupplierPurchaseBatchRequisition,
} from "@/repositories/supplier-purchase-batch-records";
import {
  listSupplierPurchaseBatchItems,
  listSupplierPurchaseBatchOrders,
  listSupplierPurchaseBatchRequisitions,
} from "@/repositories/supplier-purchase-batch-children";
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
  visible_project_ids: string[] | null;
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
type BatchProjectOptionTimeRange =
  | {
    updated_at_from?: never;
    updated_at_to?: never;
    updated_at_before?: never;
  }
  | {
    updated_at_from: string;
    updated_at_to: string;
    updated_at_before?: never;
  }
  | {
    updated_at_from: string;
    updated_at_before: string;
    updated_at_to?: never;
  };
export type BatchProjectOptionInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
} & BatchProjectOptionTimeRange;
export type BatchCostCategoryInput = PageInput & {
  tenant_id: string;
  keyword?: string;
};
export type BatchCommandContext = {
  tenant_id: string;
  batch_id: string;
  expected_version: number;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type BatchDraftCommandInput = BatchCommandContext & {
  project_id: string;
  reason: string;
  expected_delivery_date?: string | null;
  remark?: string | null;
  items: Array<{
    supplier_sku_id: string;
    cost_category_id: string;
    quantity: string;
  }>;
};
export type BatchReviewCommandInput = BatchCommandContext & {
  action: "approve" | "reject";
  remark: string | null;
  can_override_budget: boolean;
};
export type { SupplierPurchaseBatchCommandResult };

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type SingleResult = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  gte: (column: string, value: unknown) => Query;
  lte: (column: string, value: unknown) => Query;
  lt: (column: string, value: unknown) => Query;
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
    return listSupplierPurchaseBatchItems(this.client, input);
  }

  async listRequisitions(
    input: BatchChildPageInput,
  ): Promise<Page<SupplierPurchaseBatchRequisition>> {
    return listSupplierPurchaseBatchRequisitions(this.client, input);
  }

  async listOrders(
    input: BatchChildPageInput,
  ): Promise<Page<SupplierPurchaseBatchOrder>> {
    return listSupplierPurchaseBatchOrders(this.client, input);
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
    if (input.updated_at_from) {
      request = request.gte("updated_at", input.updated_at_from);
    }
    if (input.updated_at_to) {
      request = request.lte("updated_at", input.updated_at_to);
    }
    if (input.updated_at_before) {
      request = request.lt("updated_at", input.updated_at_before);
    }
    request = input.updated_at_from
      ? request.order("updated_at", { ascending: false }).order("id", {
        ascending: false,
      })
      : request.order("name", { ascending: true }).order("id", {
        ascending: true,
      });
    const { data, error, count } = await request.range(
      ...pageRange(pagination),
    );
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

  saveDraft(input: BatchDraftCommandInput) {
    return this.command(
      "save_supplier_purchase_batch_draft",
      {
        ...commandParams(input),
        p_project_id: input.project_id,
        p_reason: input.reason,
        p_expected_delivery_date: input.expected_delivery_date ?? null,
        p_remark: input.remark ?? null,
        p_items: input.items,
      },
      "保存供应商采购批次草稿失败",
      "saved",
    );
  }

  submit(input: BatchCommandContext) {
    return this.command(
      "submit_supplier_purchase_batch",
      commandParams(input),
      "提交供应商采购批次失败",
      "submitted",
    );
  }

  cancel(input: BatchCommandContext & { reason: string }) {
    return this.command(
      "cancel_supplier_purchase_batch",
      { ...commandParams(input), p_reason: input.reason },
      "取消供应商采购批次失败",
      "cancelled",
    );
  }

  review(input: BatchReviewCommandInput) {
    return executeSupplierPurchaseBatchCommand({
      client: this.client,
      name: "review_supplier_purchase_batch",
      params: { ...commandParams(input), p_action: input.action,
        p_remark: input.remark,
        p_can_override_budget: input.can_override_budget },
      message: "审批供应商采购批次失败",
      successStatus: input.action === "approve" ? "ordered" : "rejected",
      allowRevisionRequired: input.action === "approve",
    });
  }

  private command(
    name: string,
    params: Record<string, unknown>,
    message: string,
    successStatus: SupplierPurchaseBatchCommandResult["status"],
  ) {
    return executeSupplierPurchaseBatchCommand({
      client: this.client, name, params, message, successStatus,
    });
  }

}

function commandParams(input: BatchCommandContext) {
  return {
    p_batch_id: input.batch_id,
    p_tenant_id: input.tenant_id,
    p_expected_version: input.expected_version,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
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
  const value = keyword?.trim();
  const pattern = value
    ? quotePostgrestValue(buildIlikePattern(value))
    : undefined;
  return pattern
    ? request.or(
        columns.map((column) => `${column}.ilike.${pattern}`).join(","),
      )
    : request;
}

function buildIlikePattern(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
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
