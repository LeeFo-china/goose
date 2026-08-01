import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  SupplierPaymentCommandEnvelopeSchema,
  SupplierPaymentRequestSchema,
  type SupplierPaymentCommandEnvelope,
} from "@/repositories/supplier-payment-records";
import type {
  SupplierPaymentAllocationInput,
  SupplierPaymentRequestDraftAllocation,
} from "@/schema/supplier-payments";
import {
  SupplierPaymentMethodSchema,
  SupplierPaymentRequestStatusSchema,
} from "@/schema/supplier-payments";
import { SupabaseDB } from "@/utils/supabase";

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};
type PageInput = { page: number; pageSize: number };

export type SupplierPaymentRequestListInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  project_id?: string;
  tenant_supplier_id?: string;
  status?: z.infer<typeof SupplierPaymentRequestStatusSchema>;
  keyword?: string;
  created_from?: string;
  created_to?: string;
};
export type SupplierPaymentListInput = PageInput & {
  tenant_id: string;
  payment_request_id: string;
};
export type SupplierPaymentRequestCommandContext = {
  tenant_id: string;
  payment_request_id: string;
  expected_version: number;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/);
const nullableRemark = z.string().max(500).nullable();
const pageFields = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100),
};

const SupplierPaymentRequestListItemSchema = z.object({
  id: uuid,
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_name: z.string().min(1),
  request_no: z.string().min(1),
  status: SupplierPaymentRequestStatusSchema,
  currency: z.literal("CNY"),
  requested_amount: money,
  paid_amount: money,
  reason: z.string().min(1),
  version: z.number().int().positive(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();
const SupplierPaymentRequestPageSchema = z.object({
  items: z.array(SupplierPaymentRequestListItemSchema),
  ...pageFields,
}).strict();

const SupplierPaymentRequestDetailAllocationSchema = z.object({
  id: uuid,
  payable_event_id: uuid,
  requested_amount: money,
  paid_amount: money,
  payable_amount: money,
  due_at: dateTime,
  supplier_purchase_order_id: uuid,
  receipt_id: uuid,
  receipt_item_id: uuid,
  invoice_required_before_payment: z.boolean(),
}).strict();
const SupplierPaymentRequestDetailSchema = z.object({
  payment_request: SupplierPaymentRequestSchema,
  allocations: z.array(SupplierPaymentRequestDetailAllocationSchema),
}).strict().nullable();

const SupplierPaymentListItemSchema = z.object({
  id: uuid,
  payment_no: z.string().min(1),
  amount: money,
  currency: z.literal("CNY"),
  payment_method: SupplierPaymentMethodSchema,
  payment_reference: z.string().min(1).max(200),
  paid_at: dateTime,
  evidence_images: z.array(z.string().min(1).max(2048)).min(1).max(9),
  remark: nullableRemark,
  confirmed_by_employee_id: uuid,
  created_at: dateTime,
}).strict();
const SupplierPaymentPageSchema = z.object({
  items: z.array(SupplierPaymentListItemSchema),
  ...pageFields,
}).strict();

export type SupplierPaymentRequestListItem =
  z.infer<typeof SupplierPaymentRequestListItemSchema>;
export type SupplierPaymentRequestDetail =
  Exclude<z.infer<typeof SupplierPaymentRequestDetailSchema>, null>;
export type SupplierPaymentListItem =
  z.infer<typeof SupplierPaymentListItemSchema>;

export class SupplierPaymentRequestsRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client(): Client {
    return this.clientProvider();
  }

  async list(input: SupplierPaymentRequestListInput) {
    const data = await this.rpc("list_supplier_payment_requests", {
      p_tenant_id: input.tenant_id,
      p_visible_project_ids: input.visible_project_ids,
      p_project_id: input.project_id ?? null,
      p_tenant_supplier_id: input.tenant_supplier_id ?? null,
      p_status: input.status ?? null,
      p_keyword: input.keyword ?? null,
      p_created_from: input.created_from ?? null,
      p_created_to: input.created_to ?? null,
      p_page: input.page,
      p_page_size: input.pageSize,
    }, "查询供应商付款申请失败");
    const result = parse(
      SupplierPaymentRequestPageSchema,
      data,
      "查询供应商付款申请失败",
    );
    return toPage(result.items, result);
  }

  async detail(
    tenantId: string,
    paymentRequestId: string,
  ): Promise<SupplierPaymentRequestDetail | null> {
    const data = await this.rpc("get_supplier_payment_request_detail", {
      p_tenant_id: tenantId,
      p_payment_request_id: paymentRequestId,
    }, "查询供应商付款申请详情失败");
    return parse(
      SupplierPaymentRequestDetailSchema,
      data,
      "查询供应商付款申请详情失败",
    );
  }

  async listPayments(input: SupplierPaymentListInput) {
    const data = await this.rpc("list_supplier_payment_request_payments", {
      p_tenant_id: input.tenant_id,
      p_payment_request_id: input.payment_request_id,
      p_page: input.page,
      p_page_size: input.pageSize,
    }, "查询供应商付款记录失败");
    const result = parse(
      SupplierPaymentPageSchema,
      data,
      "查询供应商付款记录失败",
    );
    return toPage(result.items, result);
  }

  saveDraft(
    input: SupplierPaymentRequestCommandContext & {
      project_id: string;
      tenant_supplier_id: string;
      reason: string;
      remark: string | null;
      allocations: SupplierPaymentRequestDraftAllocation[];
    },
  ) {
    return this.command("save_supplier_payment_request_draft", {
      ...baseParams(input),
      p_project_id: input.project_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_reason: input.reason,
      p_remark: input.remark,
      p_allocations: input.allocations,
    }, "保存供应商付款申请草稿失败");
  }

  submit(input: SupplierPaymentRequestCommandContext) {
    return this.command(
      "submit_supplier_payment_request",
      baseParams(input),
      "提交供应商付款申请失败",
    );
  }

  review(
    input: SupplierPaymentRequestCommandContext & {
      action: "approve" | "reject";
      remark: string | null;
    },
  ) {
    return this.command("review_supplier_payment_request", {
      ...baseParams(input),
      p_action: input.action,
      p_remark: input.remark,
    }, input.action === "approve"
      ? "审批供应商付款申请失败"
      : "驳回供应商付款申请失败");
  }

  cancel(
    input: SupplierPaymentRequestCommandContext & { reason: string },
  ) {
    return this.command("cancel_supplier_payment_request", {
      ...baseParams(input),
      p_reason: input.reason,
    }, "取消供应商付款申请失败");
  }

  close(
    input: SupplierPaymentRequestCommandContext & { reason: string },
  ) {
    return this.command("close_supplier_payment_request", {
      ...baseParams(input),
      p_reason: input.reason,
    }, "关闭供应商付款申请失败");
  }

  confirmPayment(
    input: SupplierPaymentRequestCommandContext & {
      payment_id: string;
      payment_method: z.infer<typeof SupplierPaymentMethodSchema>;
      payment_reference: string;
      paid_at: string;
      evidence_images: string[];
      remark: string | null;
      allocations: SupplierPaymentAllocationInput[];
    },
  ) {
    return this.command("confirm_supplier_payment", {
      p_payment_id: input.payment_id,
      ...baseParams(input),
      p_payment_method: input.payment_method,
      p_payment_reference: input.payment_reference,
      p_paid_at: input.paid_at,
      p_evidence_images: input.evidence_images,
      p_remark: input.remark,
      p_allocations: input.allocations,
    }, "确认供应商付款失败");
  }

  private async command(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ): Promise<SupplierPaymentCommandEnvelope> {
    const data = await this.rpc(name, params, message);
    return parse(SupplierPaymentCommandEnvelopeSchema, data, message);
  }

  private async rpc(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw Errors.dbError(message, error);
    return data;
  }
}

function baseParams(input: SupplierPaymentRequestCommandContext) {
  return {
    p_payment_request_id: input.payment_request_id,
    p_tenant_id: input.tenant_id,
    p_expected_version: input.expected_version,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

function toPage<T>(
  list: T[],
  input: { page: number; page_size: number; total: number },
) {
  return {
    list,
    pagination: {
      page: input.page,
      pageSize: input.page_size,
      total: input.total,
      totalPages: input.total
        ? Math.ceil(input.total / input.page_size)
        : 0,
    },
  };
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export const supplierPaymentRequestsRepository =
  new SupplierPaymentRequestsRepository();
