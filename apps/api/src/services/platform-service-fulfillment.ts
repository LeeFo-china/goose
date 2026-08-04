import { Errors } from "@/errors/error-factory";
import {
  platformServiceFulfillmentRepository,
  type PlatformServiceFulfillmentRepository,
} from "@/repositories/platform-service-fulfillment";
import type {
  AtomicActionResult,
  OrderRecord,
  WorkOrderRecord,
} from "@/repositories/platform-service-order-records";
import type {
  PlatformServiceAcceptancePreparationInput,
  PlatformServiceFulfillmentRecordInput,
  PlatformServiceOrderListQuery,
  PlatformServiceRefundRequestListQuery,
  PlatformServiceRefundReviewInput,
  PlatformServiceWorkOrderAssignInput,
  PlatformServiceWorkOrderListQuery,
  PlatformServiceWorkOrderTransitionInput,
} from "@/schema/platform-service-fulfillment";
import type { AuthContext } from "@/services/authorization";
import { serializeTenantServiceOrder } from "@/services/platform-service-order-views";

type RepositoryPort = Pick<
  PlatformServiceFulfillmentRepository,
  | "listPlatformServiceOrders"
  | "findPlatformServiceOrderById"
  | "listPlatformServiceWorkOrders"
  | "findPlatformServiceWorkOrderById"
  | "assignServiceWorkOrder"
  | "transitionServiceWorkOrder"
  | "createFulfillmentRecord"
  | "upsertAcceptancePreparation"
  | "listPlatformServiceRefundRequests"
  | "reviewServiceRefundRequest"
>;

type PlatformServiceFulfillmentServiceDependencies = {
  repository?: RepositoryPort;
  nowFactory?: () => Date;
};

const ORDER_READ_PERMISSION = "platform.service_order.read";
const WORK_ORDER_MANAGE_PERMISSION = "platform.service_work_order.manage";
const REFUND_REVIEW_PERMISSION = "platform.service_refund.review";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PlatformServiceFulfillmentService {
  private readonly repository: RepositoryPort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: PlatformServiceFulfillmentServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      platformServiceFulfillmentRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listOrders(
    authContext: AuthContext,
    query: Partial<PlatformServiceOrderListQuery> = {},
  ) {
    this.assertCanReadOrders(authContext);
    const result = await this.repository.listPlatformServiceOrders({
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
      paymentStatus: query.paymentStatus,
      serviceStatus: query.serviceStatus,
      keyword: query.keyword,
      tenantKeyword: query.tenantKeyword,
    });
    const now = this.nowFactory();
    return {
      ...result,
      list: result.list.map((order) => serializePlatformOrder(order, now)),
      server_time: now.toISOString(),
    };
  }

  async getOrder(authContext: AuthContext, orderId: string) {
    this.assertCanReadOrders(authContext);
    const order = await this.repository.findPlatformServiceOrderById(orderId);
    if (!order) {
      throw Errors.business(
        404,
        "平台技术服务订单不存在",
        "SERVICE_ORDER_NOT_FOUND",
      );
    }
    return { order: serializePlatformOrder(order, this.nowFactory()) };
  }

  async listWorkOrders(
    authContext: AuthContext,
    query: Partial<PlatformServiceWorkOrderListQuery> = {},
  ) {
    this.assertCanManageWorkOrders(authContext);
    const result = await this.repository.listPlatformServiceWorkOrders({
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
      status: query.status,
      assigneeEmployeeId: query.assigneeEmployeeId,
      keyword: query.keyword,
      tenantKeyword: query.tenantKeyword,
    });
    return {
      ...result,
      list: result.list.map(serializePlatformWorkOrder),
    };
  }

  async getWorkOrder(authContext: AuthContext, workOrderId: string) {
    this.assertCanManageWorkOrders(authContext);
    const workOrder = await this.repository.findPlatformServiceWorkOrderById(
      workOrderId,
    );
    if (!workOrder) {
      throw Errors.business(
        404,
        "平台技术服务工单不存在",
        "SERVICE_WORK_ORDER_NOT_FOUND",
      );
    }
    return { work_order: serializePlatformWorkOrder(workOrder) };
  }

  async assignWorkOrder(
    authContext: AuthContext,
    workOrderId: string,
    input: PlatformServiceWorkOrderAssignInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    const result = await this.repository.assignServiceWorkOrder({
      workOrderId,
      assigneeEmployeeId: input.assignee_employee_id,
      expectedVersion: input.expected_version,
      operatorEmployeeId: employeeId,
      remark: input.remark,
      metadata: input.metadata,
    });
    return this.serializeAtomicWorkOrderResult(result);
  }

  async transitionWorkOrder(
    authContext: AuthContext,
    workOrderId: string,
    input: PlatformServiceWorkOrderTransitionInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    const result = await this.repository.transitionServiceWorkOrder({
      workOrderId,
      toStatus: input.to_status,
      expectedVersion: input.expected_version,
      operatorEmployeeId: employeeId,
      remark: input.remark,
      metadata: input.metadata,
    });
    return this.serializeAtomicWorkOrderResult(result);
  }

  async createFulfillmentRecord(
    authContext: AuthContext,
    workOrderId: string,
    context: { tenantId: string; serviceOrderId: string },
    input: PlatformServiceFulfillmentRecordInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    return this.repository.createFulfillmentRecord({
      tenantId: context.tenantId,
      serviceOrderId: context.serviceOrderId,
      workOrderId,
      recordType: input.record_type,
      title: input.title,
      content: input.content,
      occurredAt: input.occurred_at,
      fileIds: input.file_ids,
      createdByEmployeeId: employeeId,
    });
  }

  async upsertAcceptancePreparation(
    authContext: AuthContext,
    workOrderId: string,
    context: { tenantId: string; serviceOrderId: string },
    input: PlatformServiceAcceptancePreparationInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    return this.repository.upsertAcceptancePreparation({
      tenantId: context.tenantId,
      serviceOrderId: context.serviceOrderId,
      workOrderId,
      status: input.status,
      summary: input.summary,
      fileIds: input.file_ids,
      preparedByEmployeeId: employeeId,
    });
  }

  async listRefundRequests(
    authContext: AuthContext,
    query: Partial<PlatformServiceRefundRequestListQuery> = {},
  ) {
    this.assertCanReviewRefunds(authContext);
    return this.repository.listPlatformServiceRefundRequests({
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
      status: query.status,
      keyword: query.keyword,
      tenantKeyword: query.tenantKeyword,
    });
  }

  async reviewRefundRequest(
    authContext: AuthContext,
    refundRequestId: string,
    input: PlatformServiceRefundReviewInput,
  ) {
    const employeeId = this.assertCanReviewRefunds(authContext);
    const result = await this.repository.reviewServiceRefundRequest({
      refundRequestId,
      decision: input.decision,
      expectedVersion: input.expected_version,
      operatorEmployeeId: employeeId,
      reviewRemark: input.review_remark,
    });
    if (!result.refundRequest || !result.order) {
      throwBusinessConflict(
        result.errorCode,
        "平台技术服务退款申请已更新，请刷新后重试",
      );
    }
    return {
      refund_request: result.refundRequest,
      order: serializePlatformOrder(result.order, this.nowFactory()),
    };
  }

  private serializeAtomicWorkOrderResult(result: AtomicActionResult) {
    if (!result.workOrder || !result.order) {
      throwBusinessConflict(
        result.errorCode,
        "平台技术服务工单已更新，请刷新后重试",
      );
    }
    return {
      work_order: serializePlatformWorkOrder(result.workOrder),
      order: serializePlatformOrder(result.order, this.nowFactory()),
    };
  }

  private assertCanReadOrders(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!hasPermission(authContext, ORDER_READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageWorkOrders(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, WORK_ORDER_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertCanReviewRefunds(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, REFUND_REVIEW_PERMISSION)) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
  }
}

function serializePlatformOrder(order: OrderRecord, now: Date) {
  return {
    ...serializeTenantServiceOrder(order, now),
    tenant_id: order.tenant_id ?? null,
  };
}

function serializePlatformWorkOrder(workOrder: WorkOrderRecord) {
  return {
    id: workOrder.id,
    tenant_id: workOrder.tenant_id,
    service_order_id: workOrder.service_order_id,
    order_no: workOrder.order_no,
    status: workOrder.status,
    assignee_employee_id: workOrder.assignee_employee_id,
    created_by_employee_id: workOrder.created_by_employee_id,
    assigned_at: workOrder.assigned_at ?? null,
    version: workOrder.version ?? 1,
    available_actions: getWorkOrderActions(workOrder.status),
    created_at: workOrder.created_at,
    updated_at: workOrder.updated_at,
  };
}

function getWorkOrderActions(status: string) {
  const canCancel = [
    "waiting_assignment",
    "configuring",
    "deploying",
    "training",
    "awaiting_acceptance",
    "rectifying",
  ].includes(status);
  return {
    assign: {
      enabled: !["active", "canceled"].includes(status),
      label: "分配负责人",
      disabled_reason: ["active", "canceled"].includes(status)
        ? "终态工单不能重新分配"
        : null,
    },
    transition: {
      enabled: status !== "active" && status !== "canceled",
      label: "推进状态",
      disabled_reason: status === "active" || status === "canceled"
        ? "终态工单不能继续流转"
        : null,
    },
    cancel: {
      enabled: canCancel,
      label: "取消工单",
      disabled_reason: canCancel ? null : "当前状态不能取消",
    },
  };
}

function throwBusinessConflict(errorCode: string | undefined, message: string): never {
  throw Errors.business(
    409,
    message,
    errorCode ?? "SERVICE_WORK_ORDER_VERSION_CONFLICT",
  );
}

function hasPermission(authContext: AuthContext, permissionCode: string) {
  return authContext.permissions.some((permission) =>
    permission.code === permissionCode
  );
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizePageSize(value: number | undefined) {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
}

export const platformServiceFulfillmentService =
  new PlatformServiceFulfillmentService();
