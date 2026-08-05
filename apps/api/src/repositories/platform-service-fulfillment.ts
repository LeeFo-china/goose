import { ErrorCodes } from "../errors/error-codes";
import { Errors } from "../errors/error-factory";
import { SupabaseDB } from "../utils/supabase";
import {
  buildIlikePattern,
  type AcceptancePreparationInput,
  type AssignWorkOrderInput,
  type AtomicActionResult,
  type FulfillmentRecordCreateInput,
  normalizePagination,
  type OrderRecord,
  pageResult,
  PLATFORM_SERVICE_ORDER_DETAIL_SELECT,
  PLATFORM_SERVICE_ORDER_SELECT,
  PLATFORM_SERVICE_REFUND_REQUEST_SELECT,
  PLATFORM_SERVICE_WORK_ORDER_SELECT,
  type RefundReviewResult,
  type ServiceRefundReviewInput,
  type TransitionWorkOrderInput,
  type WorkOrderRecord,
} from "./platform-service-order-records";

type QueryResult = { data: unknown; error: unknown; count?: number | null };

type ServiceQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact" }): ServiceQuery;
  insert(record: Record<string, unknown> | Array<Record<string, unknown>>): ServiceQuery;
  eq(column: string, value: unknown): ServiceQuery;
  in(column: string, values: readonly unknown[]): ServiceQuery;
  ilike(column: string, pattern: string): ServiceQuery;
  or(filter: string): ServiceQuery;
  order(column: string, options: { ascending: boolean }): ServiceQuery;
  range(from: number, to: number): ServiceQuery;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};

type ServiceClient = {
  from(
    table:
      | "tenant_service_orders"
      | "tenant_service_work_orders"
      | "tenant_service_refund_requests"
      | "tenant_service_fulfillment_records"
      | "tenant_service_fulfillment_attachments"
      | "tenant_service_acceptance_preparations"
      | "platform_file_objects",
  ): ServiceQuery;
  rpc(
    name:
      | "platform_service_assign_work_order"
      | "platform_service_transition_work_order"
      | "platform_service_review_refund_request",
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

type FulfillmentAttachmentFileObjectRecord = {
  id: string;
  tenant_id: string | null;
  scene: string;
  provider: string;
  visibility: string;
  status: string;
  deleted_at: string | null;
  created_by_employee_id: string | null;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
};

const FULFILLMENT_ATTACHMENT_SCENE = "tenant_service_fulfillment_attachment";

export class PlatformServiceFulfillmentRepository {
  constructor(
    private readonly clientProvider: () => ServiceClient = () =>
      SupabaseDB.getAdminClient() as unknown as ServiceClient,
  ) {}

  async listPlatformServiceOrders(input: {
    page: number;
    pageSize: number;
    paymentStatus?: string;
    serviceStatus?: string;
    keyword?: string;
    tenantKeyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let request = this.orders()
      .select(PLATFORM_SERVICE_ORDER_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.paymentStatus) {
      request = request.eq("payment_status", input.paymentStatus);
    }
    if (input.serviceStatus) {
      request = request.eq("service_status", input.serviceStatus);
    }
    if (input.keyword) {
      const pattern = buildIlikePattern(input.keyword);
      request = request.or(`order_no.ilike.${pattern},product_code.ilike.${pattern}`);
    }
    if (input.tenantKeyword) {
      request = request.ilike("tenant.name", buildIlikePattern(input.tenantKeyword));
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台技术服务订单失败", error);
    return pageResult<OrderRecord>(data, count, pagination);
  }

  async findPlatformServiceOrderById(orderId: string) {
    const { data, error } = await this.orders()
      .select(PLATFORM_SERVICE_ORDER_DETAIL_SELECT)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务订单详情失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async listPlatformServiceWorkOrders(input: {
    page: number;
    pageSize: number;
    status?: string;
    assigneeEmployeeId?: string;
    keyword?: string;
    tenantKeyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let request = this.workOrders()
      .select(PLATFORM_SERVICE_WORK_ORDER_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.status) request = request.eq("status", input.status);
    if (input.assigneeEmployeeId) {
      request = request.eq("assignee_employee_id", input.assigneeEmployeeId);
    }
    if (input.keyword) {
      request = request.ilike("order_no", buildIlikePattern(input.keyword));
    }
    if (input.tenantKeyword) {
      request = request.ilike("order.tenant.name", buildIlikePattern(input.tenantKeyword));
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台技术服务工单失败", error);
    return pageResult<WorkOrderRecord>(data, count, pagination);
  }

  async findPlatformServiceWorkOrderById(workOrderId: string) {
    const { data, error } = await this.workOrders()
      .select(PLATFORM_SERVICE_WORK_ORDER_SELECT)
      .eq("id", workOrderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务工单详情失败", error);
    return (data as WorkOrderRecord | null) ?? null;
  }

  async assignServiceWorkOrder(input: AssignWorkOrderInput): Promise<AtomicActionResult> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_assign_work_order",
      {
        p_work_order_id: input.workOrderId,
        p_assignee_employee_id: input.assigneeEmployeeId,
        p_expected_version: input.expectedVersion,
        p_operator_employee_id: input.operatorEmployeeId,
        p_remark: input.remark ?? null,
        p_metadata: input.metadata ?? {},
      },
    );
    if (error) throw Errors.dbError("分配平台技术服务工单失败", error);
    return this.mapAtomicActionResult(data);
  }

  async transitionServiceWorkOrder(
    input: TransitionWorkOrderInput,
  ): Promise<AtomicActionResult> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_transition_work_order",
      {
        p_work_order_id: input.workOrderId,
        p_to_status: input.toStatus,
        p_expected_version: input.expectedVersion,
        p_operator_employee_id: input.operatorEmployeeId,
        p_remark: input.remark ?? null,
        p_metadata: input.metadata ?? {},
      },
    );
    if (error) throw Errors.dbError("流转平台技术服务工单失败", error);
    return this.mapAtomicActionResult(data);
  }

  async createFulfillmentRecord(input: FulfillmentRecordCreateInput) {
    const { data, error } = await this.fulfillmentRecords()
      .insert({
        tenant_id: input.tenantId,
        service_order_id: input.serviceOrderId,
        work_order_id: input.workOrderId,
        record_type: input.recordType,
        title: input.title,
        content: input.content,
        occurred_at: input.occurredAt,
        created_by_employee_id: input.createdByEmployeeId,
      })
      .select("id,tenant_id,service_order_id,work_order_id,record_type,title,content,occurred_at,created_by_employee_id,created_at,updated_at")
      .single();
    if (error) throw Errors.dbError("创建平台技术服务履约记录失败", error);
    const record = data as Record<string, unknown>;
    if (input.fileIds.length > 0) {
      await this.createAttachments({
        tenantId: input.tenantId,
        serviceOrderId: input.serviceOrderId,
        workOrderId: input.workOrderId,
        fulfillmentRecordId: String(record.id),
        fileIds: input.fileIds,
        createdByEmployeeId: input.createdByEmployeeId,
      });
    }
    return record;
  }

  async upsertAcceptancePreparation(input: AcceptancePreparationInput) {
    const submittedAt = input.status === "submitted"
      ? new Date().toISOString()
      : null;
    const { data, error } = await this.acceptancePreparations()
      .insert({
        tenant_id: input.tenantId,
        service_order_id: input.serviceOrderId,
        work_order_id: input.workOrderId,
        status: input.status,
        summary: input.summary,
        prepared_by_employee_id: input.preparedByEmployeeId,
        prepared_at: new Date().toISOString(),
        submitted_at: submittedAt,
      })
      .select("id,tenant_id,service_order_id,work_order_id,status,summary,prepared_by_employee_id,prepared_at,submitted_at,created_at,updated_at")
      .single();
    if (error) throw Errors.dbError("保存平台技术服务验收准备失败", error);
    if (input.fileIds.length > 0) {
      await this.createAttachments({
        tenantId: input.tenantId,
        serviceOrderId: input.serviceOrderId,
        workOrderId: input.workOrderId,
        fulfillmentRecordId: null,
        fileIds: input.fileIds,
        createdByEmployeeId: input.preparedByEmployeeId,
      });
    }
    return data as Record<string, unknown>;
  }

  async listPlatformServiceRefundRequests(input: {
    page: number;
    pageSize: number;
    status?: string;
    keyword?: string;
    tenantKeyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let request = this.refundRequests()
      .select(PLATFORM_SERVICE_REFUND_REQUEST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.status) request = request.eq("status", input.status);
    if (input.keyword) request = request.ilike("reason", buildIlikePattern(input.keyword));
    if (input.tenantKeyword) {
      request = request.ilike("order.tenant.name", buildIlikePattern(input.tenantKeyword));
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台技术服务退款申请失败", error);
    return pageResult<RefundReviewResult["refundRequest"]>(data, count, pagination);
  }

  async reviewServiceRefundRequest(
    input: ServiceRefundReviewInput,
  ): Promise<AtomicActionResult> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_review_refund_request",
      {
        p_refund_request_id: input.refundRequestId,
        p_decision: input.decision,
        p_expected_version: input.expectedVersion,
        p_operator_employee_id: input.operatorEmployeeId,
        p_review_remark: input.reviewRemark ?? null,
      },
    );
    if (error) throw Errors.dbError("审核平台技术服务退款申请失败", error);
    return this.mapAtomicActionResult(data);
  }

  private orders() {
    return this.clientProvider().from("tenant_service_orders");
  }

  private workOrders() {
    return this.clientProvider().from("tenant_service_work_orders");
  }

  private refundRequests() {
    return this.clientProvider().from("tenant_service_refund_requests");
  }

  private fulfillmentRecords() {
    return this.clientProvider().from("tenant_service_fulfillment_records");
  }

  private fulfillmentAttachments() {
    return this.clientProvider().from("tenant_service_fulfillment_attachments");
  }

  private acceptancePreparations() {
    return this.clientProvider().from("tenant_service_acceptance_preparations");
  }

  private fileObjects() {
    return this.clientProvider().from("platform_file_objects");
  }

  private async createAttachments(input: {
    tenantId: string;
    serviceOrderId: string;
    workOrderId: string;
    fulfillmentRecordId: string | null;
    fileIds: string[];
    createdByEmployeeId: string;
  }) {
    const fileObjects = await this.findBindableFulfillmentAttachmentFiles(input);
    const { error } = await this.fulfillmentAttachments()
      .insert(input.fileIds.map((fileId) => ({
        tenant_id: input.tenantId,
        service_order_id: input.serviceOrderId,
        work_order_id: input.workOrderId,
        fulfillment_record_id: input.fulfillmentRecordId,
        file_id: fileId,
        file_name: fileObjects.get(fileId)?.original_name ?? null,
        mime_type: fileObjects.get(fileId)?.mime_type ?? null,
        size_bytes: fileObjects.get(fileId)?.size_bytes ?? null,
        created_by_employee_id: input.createdByEmployeeId,
      })))
      .select("id");
    if (error) throw Errors.dbError("绑定平台技术服务附件失败", error);
  }

  private async findBindableFulfillmentAttachmentFiles(input: {
    tenantId: string;
    fileIds: string[];
    createdByEmployeeId: string;
  }) {
    const uniqueFileIds = Array.from(new Set(input.fileIds));
    const { data, error } = await this.fileObjects()
      .select("id,tenant_id,scene,provider,visibility,status,deleted_at,created_by_employee_id,original_name,mime_type,size_bytes")
      .in("id", uniqueFileIds);
    if (error) throw Errors.dbError("查询平台技术服务附件文件失败", error);

    const files = new Map(
      ((data as FulfillmentAttachmentFileObjectRecord[] | null) ?? [])
        .map((file) => [file.id, file]),
    );
    for (const fileId of uniqueFileIds) {
      const file = files.get(fileId);
      if (!file || !this.isBindableFulfillmentAttachmentFile(file, input)) {
        throw Errors.business(
          400,
          "平台技术服务履约附件不可绑定",
          ErrorCodes.SERVICE_FULFILLMENT_ATTACHMENT_INVALID,
          { file_id: fileId },
        );
      }
    }
    return files;
  }

  private isBindableFulfillmentAttachmentFile(
    file: FulfillmentAttachmentFileObjectRecord,
    input: { tenantId: string; createdByEmployeeId: string },
  ) {
    return Boolean(
      (file.tenant_id === input.tenantId || file.tenant_id === null) &&
        file.scene === FULFILLMENT_ATTACHMENT_SCENE &&
        file.provider === "tencent_cos" &&
        file.visibility === "private" &&
        file.status === "active" &&
        file.deleted_at === null &&
        file.created_by_employee_id === input.createdByEmployeeId,
    );
  }

  private mapAtomicActionResult(data: unknown): AtomicActionResult {
    const result = data as {
      work_order?: unknown;
      refund_request?: unknown;
      order?: unknown;
      error_code?: unknown;
    } | null;
    return {
      workOrder: (result?.work_order as WorkOrderRecord | null | undefined) ?? null,
      refundRequest: (result?.refund_request as AtomicActionResult["refundRequest"]) ??
        null,
      order: (result?.order as OrderRecord | null) ?? null,
      errorCode: typeof result?.error_code === "string"
        ? result.error_code
        : undefined,
    };
  }
}

export const platformServiceFulfillmentRepository =
  new PlatformServiceFulfillmentRepository();
