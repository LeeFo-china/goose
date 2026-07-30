import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  mapSupplierPurchaseRequisitionEnvelopeError,
  throwSupplierCommandDatabaseError,
} from "@/repositories/supplier-command-errors";
import {
  PROJECT_COST_COMMITMENT_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_SELECT,
  ProjectCostCommitmentRecordSchema,
  SupplierPurchaseRequisitionCommandEnvelopeSchema,
  SupplierPurchaseRequisitionDetailSchema,
  SupplierPurchaseRequisitionItemSchema,
  SupplierPurchaseRequisitionRecordSchema,
  type SupplierPurchaseRequisitionDetail,
  type SupplierPurchaseRequisitionItem,
  type SupplierPurchaseRequisitionRecord,
} from "@/repositories/supplier-purchase-requisition-records";
import type {
  SupplierPurchaseRequisitionBudgetStatus,
  SupplierPurchaseRequisitionStatus,
} from "@/schema/supplier-purchase-requisitions";
import { SupabaseDB } from "@/utils/supabase";

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

export type SupplierPurchaseRequisitionListInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
  status?: SupplierPurchaseRequisitionStatus;
  budget_status?: SupplierPurchaseRequisitionBudgetStatus;
  project_id?: string;
  tenant_supplier_id?: string;
};
export type SupplierPurchaseRequisitionItemListInput = PageInput & {
  tenant_id: string;
  requisition_id: string;
};
export type SupplierPurchaseRequisitionCommandContext = {
  tenant_id: string;
  requisition_id: string;
  expected_version: number;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};
export type SupplierPurchaseRequisitionDraftCommandInput =
  SupplierPurchaseRequisitionCommandContext & {
    project_id: string;
    tenant_supplier_id: string;
    expected_delivery_date?: string | null;
    reason: string;
    remark?: string | null;
    items: Array<{
      supplier_sku_id: string;
      cost_category_id: string;
      quantity: string;
    }>;
  };
export type SupplierPurchaseRequisitionCommandResult = {
  status: "saved" | "submitted" | "approved" | "rejected" | "cancelled" |
    "converted";
  idempotent: boolean;
  requisition: SupplierPurchaseRequisitionRecord;
  version: number;
  purchase_order_id?: string;
};
const REQUISITION_STATUS_BY_RESULT = {
  saved: "draft",
  submitted: "pending_approval",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  converted: "converted",
} as const satisfies Record<
  SupplierPurchaseRequisitionCommandResult["status"],
  SupplierPurchaseRequisitionStatus
>;
export type SupplierPurchaseRequisitionPage =
  Page<SupplierPurchaseRequisitionRecord>;
export type SupplierPurchaseRequisitionItemPage =
  Page<SupplierPurchaseRequisitionItem>;
export type {
  SupplierPurchaseRequisitionDetail,
  SupplierPurchaseRequisitionItem,
  SupplierPurchaseRequisitionRecord,
} from "@/repositories/supplier-purchase-requisition-records";

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
  limit: (count: number) => Query;
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

export class SupplierPurchaseRequisitionsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async listRequisitions(
    input: SupplierPurchaseRequisitionListInput,
  ): Promise<SupplierPurchaseRequisitionPage> {
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

    let request = this.client.from("supplier_purchase_requisitions")
      .select(SUPPLIER_PURCHASE_REQUISITION_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id);
    if (input.project_id) {
      request = request.eq("project_id", input.project_id);
    } else if (input.visible_project_ids) {
      request = request.in("project_id", input.visible_project_ids);
    }
    if (input.status) request = request.eq("status", input.status);
    if (input.budget_status) {
      request = request.eq("budget_status", input.budget_status);
    }
    if (input.tenant_supplier_id) {
      request = request.eq("tenant_supplier_id", input.tenant_supplier_id);
    }
    request = applyKeyword(request, input.keyword);

    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商采购申请失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseRequisitionRecordSchema,
        data,
        "查询供应商采购申请失败",
      ),
      pagination,
      count,
    );
  }

  async findRequisition(
    tenantId: string,
    requisitionId: string,
  ): Promise<SupplierPurchaseRequisitionDetail | null> {
    const { data, error } = await this.client
      .from("supplier_purchase_requisitions")
      .select(SUPPLIER_PURCHASE_REQUISITION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", requisitionId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商采购申请失败", error);
    if (data === null) return null;
    const requisition = parse(
      SupplierPurchaseRequisitionRecordSchema,
      data,
      "查询供应商采购申请失败",
    );

    const snapshotResult = await this.client
      .from("project_cost_commitments")
      .select(PROJECT_COST_COMMITMENT_SELECT)
      .eq("tenant_id", tenantId)
      .eq("source_type", "supplier_purchase_requisition")
      .eq("source_id", requisitionId)
      .order("cost_category_id", { ascending: true })
      .order("id", { ascending: true })
      .limit(100);
    if (snapshotResult.error) {
      throw Errors.dbError(
        "查询采购申请预算快照失败",
        snapshotResult.error,
      );
    }
    return parse(
      SupplierPurchaseRequisitionDetailSchema,
      {
        requisition,
        budget_snapshots: parseRows(
          ProjectCostCommitmentRecordSchema,
          snapshotResult.data,
          "查询采购申请预算快照失败",
        ),
      },
      "查询供应商采购申请失败",
    );
  }

  async listItems(
    input: SupplierPurchaseRequisitionItemListInput,
  ): Promise<SupplierPurchaseRequisitionItemPage> {
    const pagination = normalizePage(input);
    const { data, error, count } = await this.client
      .from("supplier_purchase_requisition_items")
      .select(SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("purchase_requisition_id", input.requisition_id)
      .order("line_no", { ascending: true })
      .order("id", { ascending: true })
      .range(...pageRange(pagination));
    if (error) throw Errors.dbError("查询供应商采购申请明细失败", error);
    return toPage(
      parseRows(
        SupplierPurchaseRequisitionItemSchema,
        data,
        "查询供应商采购申请明细失败",
      ),
      pagination,
      count,
    );
  }

  saveDraft(input: SupplierPurchaseRequisitionDraftCommandInput) {
    return this.command(
      "save_supplier_purchase_requisition_draft",
      {
        p_requisition_id: input.requisition_id,
        p_tenant_id: input.tenant_id,
        p_project_id: input.project_id,
        p_tenant_supplier_id: input.tenant_supplier_id,
        p_expected_version: input.expected_version,
        p_expected_delivery_date: input.expected_delivery_date ?? null,
        p_reason: input.reason,
        p_remark: input.remark ?? null,
        p_items: input.items,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
      "保存供应商采购申请草稿失败",
      "saved",
    );
  }

  submit(input: SupplierPurchaseRequisitionCommandContext) {
    return this.command(
      "submit_supplier_purchase_requisition",
      commandParams(input),
      "提交供应商采购申请失败",
      "submitted",
    );
  }

  review(
    input: SupplierPurchaseRequisitionCommandContext & {
      action: "approve" | "reject";
      remark?: string | null;
    },
  ) {
    return this.command(
      "review_supplier_purchase_requisition",
      {
        ...commandParams(input),
        p_action: input.action,
        p_remark: input.remark ?? null,
      },
      "审核供应商采购申请失败",
      input.action === "approve" ? "approved" : "rejected",
    );
  }

  cancel(
    input: SupplierPurchaseRequisitionCommandContext & { reason: string },
  ) {
    return this.command(
      "cancel_supplier_purchase_requisition",
      { ...commandParams(input), p_reason: input.reason },
      "取消供应商采购申请失败",
      "cancelled",
    );
  }

  convert(
    input: SupplierPurchaseRequisitionCommandContext & {
      purchase_order_id: string;
    },
  ) {
    return this.command(
      "convert_supplier_purchase_requisition",
      {
        ...commandParams(input),
        p_purchase_order_id: input.purchase_order_id,
      },
      "采购申请转换采购单失败",
      "converted",
    );
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
    successStatus: SupplierPurchaseRequisitionCommandResult["status"],
  ): Promise<SupplierPurchaseRequisitionCommandResult> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throwSupplierCommandDatabaseError(error, message);
    const envelope = parse(
      SupplierPurchaseRequisitionCommandEnvelopeSchema,
      data,
      message,
    );
    if (envelope.status !== successStatus) {
      throw requisitionEnvelopeError(envelope, message);
    }
    if (!envelope.requisition || envelope.version === undefined) {
      throw Errors.dbError(message, data);
    }
    if (
      envelope.requisition.status !==
        REQUISITION_STATUS_BY_RESULT[successStatus] ||
      envelope.requisition.version !== envelope.version ||
      envelope.requisition.id !== params.p_requisition_id ||
      envelope.requisition.tenant_id !== params.p_tenant_id
    ) {
      throw Errors.dbError(message, data);
    }
    if (
      successStatus === "converted" &&
      (
        !envelope.purchase_order_id ||
        envelope.purchase_order_id !== params.p_purchase_order_id ||
        envelope.requisition.purchase_order_id !== envelope.purchase_order_id
      )
    ) {
      throw Errors.dbError(message, data);
    }
    return {
      status: successStatus,
      idempotent: envelope.idempotent ?? false,
      requisition: envelope.requisition,
      version: envelope.version,
      ...(envelope.purchase_order_id
        ? { purchase_order_id: envelope.purchase_order_id }
        : {}),
    };
  }
}

function commandParams(input: SupplierPurchaseRequisitionCommandContext) {
  return {
    p_requisition_id: input.requisition_id,
    p_tenant_id: input.tenant_id,
    p_expected_version: input.expected_version,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

function requisitionEnvelopeError(
  envelope: z.infer<typeof SupplierPurchaseRequisitionCommandEnvelopeSchema>,
  message: string,
) {
  const mapped = mapSupplierPurchaseRequisitionEnvelopeError(
    envelope.status,
    envelope.error_code,
  );
  return mapped ?? Errors.dbError(message, envelope);
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
    ? request.or(`request_no.ilike.%${safe}%,reason.ilike.%${safe}%`)
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
  return parse(z.array(schema).max(100), data ?? [], message);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPurchaseRequisitionsRepository =
  new SupplierPurchaseRequisitionsRepository();
