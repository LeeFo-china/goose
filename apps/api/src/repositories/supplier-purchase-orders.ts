import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  assertProjectProcurementDestination,
} from "@/repositories/procurement-destination-records";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  SUPPLIER_PURCHASE_ORDER_ITEM_SELECT,
  SUPPLIER_PURCHASE_ORDER_SELECT,
  SupplierPurchaseOrderCatalogResultSchema,
  SupplierPurchaseOrderCommandEnvelopeSchema,
  SupplierPurchaseOrderItemSchema,
  SupplierPurchaseOrderListResultSchema,
  SupplierPurchaseOrderProjectOptionSchema,
  SupplierPurchaseOrderSupplierOptionResultSchema,
  SupplierPurchaseOrderWithReferencesSchema,
  type SupplierPurchaseOrder,
  type SupplierPurchaseOrderCatalogItem,
  type SupplierPurchaseOrderItem,
  type SupplierPurchaseOrderListOrder,
  type SupplierPurchaseOrderProjectOption,
  type SupplierPurchaseOrderSupplierOption,
  type SupplierPurchaseOrderWithReferences,
} from "@/repositories/supplier-purchase-order-records";
import {
  SupplierPurchaseOrderFinancialSummarySchema,
  type SupplierPurchaseOrderFinancialSummary,
} from "@/schema/supplier-purchase-orders";
import { SupabaseDB } from "@/utils/supabase";

export type {
  SupplierPurchaseOrder,
  SupplierPurchaseOrderCatalogItem,
  SupplierPurchaseOrderItem,
  SupplierPurchaseOrderListOrder,
  SupplierPurchaseOrderWithReferences,
} from "@/repositories/supplier-purchase-order-records";

export type SupplierPurchaseOrderPage = Page<SupplierPurchaseOrderListOrder>;
export type SupplierPurchaseOrderItemPage = Page<SupplierPurchaseOrderItem>;
export type SupplierPurchaseOrderCatalogPage =
  Page<SupplierPurchaseOrderCatalogItem>;
export type SupplierPurchaseOrderProjectOptionPage =
  Page<SupplierPurchaseOrderProjectOption>;
export type SupplierPurchaseOrderSupplierOptionPage =
  Page<SupplierPurchaseOrderSupplierOption>;

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
export type SupplierPurchaseOrderListInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
  status?: string;
  fulfillment_status?: string;
  project_id?: string;
  tenant_supplier_id?: string;
};
export type SupplierPurchaseOrderItemListInput = PageInput & {
  tenant_id: string;
  order_id: string;
};
export type SupplierPurchaseOrderCatalogInput = PageInput & {
  tenant_id: string;
  tenant_supplier_id: string;
  priced_at: string;
  keyword?: string;
};
export type SupplierPurchaseOrderProjectOptionInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
};
export type SupplierPurchaseOrderSupplierOptionInput = PageInput & {
  tenant_id: string;
  checked_at: string;
  keyword?: string;
};
export type SupplierPurchaseOrderCommandContext = {
  tenant_id: string;
  order_id: string;
  expected_version: number;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type SupplierPurchaseOrderCommandResult = {
  status: "saved" | "submitted" | "cancelled";
  idempotent: boolean;
  purchase_order: SupplierPurchaseOrder;
  version: number;
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

export class SupplierPurchaseOrdersRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listOrders(input: SupplierPurchaseOrderListInput) {
    const pagination = normalizePage(input);
    if (input.visible_project_ids?.length === 0) {
      return toPage([], pagination, 0);
    }
    if (
      input.project_id &&
      input.visible_project_ids &&
      !input.visible_project_ids.includes(input.project_id)
    ) {
      return toPage([], pagination, 0);
    }

    const { data, error } = await this.client.rpc(
      "list_supplier_purchase_orders",
      {
        p_tenant_id: input.tenant_id,
        p_visible_project_ids: input.visible_project_ids,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
        p_status: input.status ?? null,
        p_fulfillment_status: input.fulfillment_status ?? null,
        p_project_id: input.project_id ?? null,
        p_tenant_supplier_id: input.tenant_supplier_id ?? null,
        p_keyword: normalizeKeyword(input.keyword),
      },
    );
    if (error) throw Errors.dbError("查询供应商采购单失败", error);
    const result = parse(
      SupplierPurchaseOrderListResultSchema,
      data,
      "查询供应商采购单失败",
    );
    const total = parseTotal(result.total, "查询供应商采购单失败");
    return toPage(
      result.items,
      { page: result.page, pageSize: result.page_size },
      total,
    );
  }

  async findOrder(tenantId: string, orderId: string) {
    const { data, error } = await this.client.from("supplier_purchase_orders")
      .select(SUPPLIER_PURCHASE_ORDER_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商采购单失败", error);
    if (data === null) return null;
    const order = parse(
      SupplierPurchaseOrderWithReferencesSchema,
      data,
      "查询供应商采购单失败",
    );
    assertProjectProcurementDestination(order);
    return order;
  }

  async listItems(input: SupplierPurchaseOrderItemListInput) {
    const pagination = normalizePage(input);
    const { data, error, count } = await this.client
      .from("supplier_purchase_order_items")
      .select(SUPPLIER_PURCHASE_ORDER_ITEM_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("supplier_purchase_order_id", input.order_id)
      .order("line_no", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商采购单明细失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseOrderItemSchema,
        data,
        "查询供应商采购单明细失败",
      ),
      pagination,
      count,
    );
  }

  async listCatalog(input: SupplierPurchaseOrderCatalogInput) {
    const pagination = normalizePage(input);
    const { data, error } = await this.client.rpc(
      "resolve_supplier_purchase_order_catalog",
      {
        p_tenant_id: input.tenant_id,
        p_tenant_supplier_id: input.tenant_supplier_id,
        p_priced_at: input.priced_at,
        p_keyword: input.keyword?.trim() || null,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(error, "查询供应商采购目录失败");
    }
    const result = parse(
      SupplierPurchaseOrderCatalogResultSchema,
      data,
      "查询供应商采购目录失败",
    );
    return toPage(
      result.items,
      { page: result.page, pageSize: result.page_size },
      result.total,
    );
  }

  async listProjectOptions(input: SupplierPurchaseOrderProjectOptionInput) {
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
    request = applyProjectKeyword(request, input.keyword);
    const { data, error, count } = await request
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询采购单项目选项失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseOrderProjectOptionSchema,
        data,
        "查询采购单项目选项失败",
      ),
      pagination,
      count,
    );
  }

  async listSupplierOptions(input: SupplierPurchaseOrderSupplierOptionInput) {
    const pagination = normalizePage(input);
    const { data, error } = await this.client.rpc(
      "list_supplier_purchase_order_supplier_options",
      {
        p_tenant_id: input.tenant_id,
        p_checked_at: input.checked_at,
        p_keyword: input.keyword?.trim() || null,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(error, "查询采购单供应商选项失败");
    }
    const result = parse(
      SupplierPurchaseOrderSupplierOptionResultSchema,
      data,
      "查询采购单供应商选项失败",
    );
    return toPage(
      result.items,
      { page: result.page, pageSize: result.page_size },
      result.total,
    );
  }

  async getFinancialSummary(
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<SupplierPurchaseOrderFinancialSummary> {
    const { data, error } = await this.client.rpc(
      "get_supplier_purchase_order_financial_summary",
      {
        p_tenant_id: tenantId,
        p_supplier_purchase_order_id: purchaseOrderId,
      },
    );
    if (error) throw Errors.dbError("查询采购单财务摘要失败", error);
    return parse(
      SupplierPurchaseOrderFinancialSummarySchema,
      data,
      "查询采购单财务摘要失败",
    );
  }

  saveDraft(
    input: SupplierPurchaseOrderCommandContext & {
      project_id: string;
      tenant_supplier_id: string;
      expected_delivery_date?: string | null;
      remark?: string | null;
      items: Array<{ supplier_sku_id: string; quantity: number }>;
    },
  ) {
    return this.command(
      "save_supplier_purchase_order_draft",
      rpcParams(input),
      "保存供应商采购单草稿失败",
      "saved",
    );
  }

  submit(input: SupplierPurchaseOrderCommandContext) {
    return this.command(
      "submit_supplier_purchase_order",
      rpcParams(input),
      "提交供应商采购单失败",
      "submitted",
    );
  }

  cancel(
    input: SupplierPurchaseOrderCommandContext & { reason: string },
  ) {
    return this.command(
      "cancel_supplier_purchase_order",
      rpcParams(input),
      "取消供应商采购单失败",
      "cancelled",
    );
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
    successStatus: SupplierPurchaseOrderCommandResult["status"],
  ): Promise<SupplierPurchaseOrderCommandResult> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);

    const envelope = parse(
      SupplierPurchaseOrderCommandEnvelopeSchema,
      data,
      message,
    );
    if (envelope.status !== successStatus) {
      throw commandEnvelopeError(envelope);
    }
    if (!envelope.purchase_order || envelope.version === undefined) {
      throw Errors.dbError(message, data);
    }
    assertProjectProcurementDestination(envelope.purchase_order);
    return {
      status: successStatus,
      idempotent: envelope.idempotent ?? false,
      purchase_order: envelope.purchase_order,
      version: envelope.version,
    };
  }
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
  const safe = normalizeKeyword(keyword);
  return safe ? request.or(`order_no.ilike.%${safe}%`) : request;
}

function normalizeKeyword(keyword?: string) {
  return keyword?.trim().replace(/[%_,().]/g, "") || null;
}

function applyProjectKeyword(request: Query, keyword?: string) {
  const safe = keyword?.trim().replace(/[%_,().]/g, "");
  return safe ? request.or(`name.ilike.%${safe}%`) : request;
}

function rpcParams(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key.startsWith("p_") ? key : `p_${key}`,
      value,
    ]),
  );
}

function commandEnvelopeError(
  envelope: z.infer<typeof SupplierPurchaseOrderCommandEnvelopeSchema>,
) {
  const code = envelope.error_code ??
    `SUPPLIER_PURCHASE_ORDER_${envelope.status.toUpperCase()}`;
  const messages: Record<typeof envelope.status, string> = {
    saved: "采购单命令响应状态不一致",
    submitted: "采购单命令响应状态不一致",
    cancelled: "采购单命令响应状态不一致",
    validation_error: envelope.reason ?? "采购单参数校验失败",
    not_found: "供应商采购单不存在",
    version_conflict: "采购单版本已变化，请刷新后重试",
    state_conflict: "采购单当前状态不允许该操作",
    price_missing: "部分采购商品缺少当前有效价格",
    price_changed: "采购价格已变化，请重新确认采购单",
    supplier_not_eligible: "当前供应商关系不允许创建采购单",
    project_invalid: "项目不存在或不属于当前租户",
  };
  const statusCode = envelope.status === "validation_error"
    ? 400
    : envelope.status === "not_found"
    ? 404
    : 409;
  return Errors.business(statusCode, messages[envelope.status], code, envelope);
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

function parseTotal(value: number | string, message: string) {
  if (typeof value === "string" && !/^(0|[1-9]\d*)$/.test(value)) {
    throw Errors.dbError(message);
  }
  const total = Number(value);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw Errors.dbError(message);
  }
  return total;
}

function parseRows<T>(schema: z.ZodType<T>, data: unknown, message: string) {
  return parse(z.array(schema), data ?? [], message);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPurchaseOrdersRepository =
  new SupplierPurchaseOrdersRepository();
