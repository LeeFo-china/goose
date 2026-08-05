import { Errors } from "@/errors/error-factory";
import {
  platformServiceFulfillmentRepository,
  type PlatformServiceFulfillmentRepository,
} from "@/repositories/platform-service-fulfillment";
import {
  platformServiceOrderShippingReportRepository,
  type PlatformServiceOrderShippingReportRepository,
} from "@/repositories/platform-service-order-shipping-reports";
import type {
  AtomicActionResult,
  OrderRecord,
} from "@/repositories/platform-service-order-records";
import type {
  PlatformServiceAcceptancePreparationInput,
  PlatformServiceFulfillmentRecordInput,
  PlatformServiceOrderListQuery,
  PlatformServiceOverdueAcceptanceConfirmInput,
  PlatformServiceRefundRequestListQuery,
  PlatformServiceRefundReviewInput,
  PlatformServiceWorkOrderAssignInput,
  PlatformServiceWorkOrderListQuery,
  PlatformServiceWorkOrderTransitionInput,
} from "@/schema/platform-service-fulfillment";
import type { AuthContext } from "@/services/authorization";
import {
  platformServiceOrderShippingService,
  type OrderShippingReportResult,
} from "@/services/platform-service-order-shipping";
import {
  latestShippingReportByOrderId,
  serializePlatformOrder,
  serializePlatformAcceptancePreparation,
  serializePlatformWorkOrder,
  serializeWechatShippingReport,
} from "@/services/platform-service-fulfillment-views";
import { systemSettingsService } from "@/services/system-settings/legacy-service";

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
  | "confirmOverdueAcceptance"
  | "listPlatformServiceRefundRequests"
  | "reviewServiceRefundRequest"
>;

type SettingsServicePort = {
  getNumber(
    key: string,
    fallbackValue: number,
    options?: { min?: number; max?: number; tenantId?: string | null },
  ): Promise<number>;
};

type PlatformServiceFulfillmentServiceDependencies = {
  repository?: RepositoryPort;
  shippingReportRepository?: ShippingReportRepositoryPort;
  orderShippingReporter?: OrderShippingReporterPort;
  settingsService?: SettingsServicePort;
  nowFactory?: () => Date;
};

type ShippingReportRepositoryPort = Pick<
  PlatformServiceOrderShippingReportRepository,
  "listByServiceOrderIds" | "findByServiceOrderId" | "findReportableOrderById"
>;

type OrderShippingReporterPort = {
  reportAcceptedOrder(input: {
    order: OrderRecord;
    source: "platform_acceptance";
  }): Promise<OrderShippingReportResult>;
};

const ORDER_READ_PERMISSION = "platform.service_order.read";
const WORK_ORDER_MANAGE_PERMISSION = "platform.service_work_order.manage";
const REFUND_REVIEW_PERMISSION = "platform.service_refund.review";
const ACCEPTANCE_WINDOW_DAYS_SETTING_KEY = "PLATFORM_SERVICE_ACCEPTANCE_WINDOW_DAYS";
const DEFAULT_ACCEPTANCE_WINDOW_DAYS = 3;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PlatformServiceFulfillmentService {
  private readonly repository: RepositoryPort;
  private readonly shippingReportRepository: ShippingReportRepositoryPort;
  private readonly orderShippingReporter: OrderShippingReporterPort;
  private readonly settingsService: SettingsServicePort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: PlatformServiceFulfillmentServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      platformServiceFulfillmentRepository;
    this.shippingReportRepository = dependencies.shippingReportRepository ??
      platformServiceOrderShippingReportRepository;
    this.orderShippingReporter = dependencies.orderShippingReporter ??
      platformServiceOrderShippingService;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
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
    const shippingReports = await this.shippingReportRepository
      .listByServiceOrderIds(result.list.map((order) => order.id));
    const shippingReportByOrderId = latestShippingReportByOrderId(
      shippingReports,
    );
    return {
      ...result,
      list: result.list.map((order) =>
        serializePlatformOrder(order, now, shippingReportByOrderId.get(order.id))
      ),
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
    const shippingReport = await this.shippingReportRepository
      .findByServiceOrderId(orderId);
    return {
      order: serializePlatformOrder(order, this.nowFactory(), shippingReport),
    };
  }

  async retryOrderShippingReport(authContext: AuthContext, orderId: string) {
    this.assertCanManageWorkOrders(authContext);
    const order = await this.shippingReportRepository
      .findReportableOrderById(orderId);
    if (!order) {
      throw Errors.business(
        404,
        "平台技术服务订单不存在",
        "SERVICE_ORDER_NOT_FOUND",
      );
    }

    const result = await this.orderShippingReporter.reportAcceptedOrder({
      order,
      source: "platform_acceptance",
    });
    if (result.status === "skipped") {
      throw Errors.business(
        409,
        "平台技术服务订单尚不满足微信履约上报条件",
        "SERVICE_ORDER_SHIPPING_REPORT_NOT_READY",
        { reason: result.skipped_reason },
      );
    }
    const now = this.nowFactory();
    return {
      order: serializePlatformOrder(order, now, result.report),
      wechat_shipping_report: serializeWechatShippingReport(result.report),
      server_time: now.toISOString(),
    };
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
    const now = this.nowFactory();
    return {
      ...result,
      list: result.list.map((workOrder) =>
        serializePlatformWorkOrder(workOrder, now)
      ),
      server_time: now.toISOString(),
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
    return { work_order: serializePlatformWorkOrder(workOrder, this.nowFactory()) };
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
    input: PlatformServiceFulfillmentRecordInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    const workOrder = await this.requireWorkOrder(workOrderId);
    return this.repository.createFulfillmentRecord({
      tenantId: workOrder.tenant_id,
      serviceOrderId: workOrder.service_order_id,
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
    input: PlatformServiceAcceptancePreparationInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    const workOrder = await this.requireWorkOrder(workOrderId);
    const submittedAt = input.status === "submitted" ? this.nowFactory() : null;
    const acceptanceDueAt = submittedAt
      ? addDays(
        submittedAt,
        await this.settingsService.getNumber(
          ACCEPTANCE_WINDOW_DAYS_SETTING_KEY,
          DEFAULT_ACCEPTANCE_WINDOW_DAYS,
          { min: 1, max: 30 },
        ),
      )
      : null;
    return this.repository.upsertAcceptancePreparation({
      tenantId: workOrder.tenant_id,
      serviceOrderId: workOrder.service_order_id,
      workOrderId,
      status: input.status,
      summary: input.summary,
      fileIds: input.file_ids,
      preparedByEmployeeId: employeeId,
      acceptanceDueAt: acceptanceDueAt?.toISOString() ?? null,
    });
  }

  async confirmOverdueAcceptance(
    authContext: AuthContext,
    workOrderId: string,
    input: PlatformServiceOverdueAcceptanceConfirmInput,
  ) {
    const employeeId = this.assertCanManageWorkOrders(authContext);
    const result = await this.repository.confirmOverdueAcceptance({
      workOrderId,
      expectedVersion: input.expected_version,
      operatorEmployeeId: employeeId,
      remark: input.remark,
      metadata: input.metadata,
    });
    if (!result.workOrder || !result.order || !result.acceptancePreparation) {
      throwBusinessConflict(
        result.errorCode,
        result.errorCode === "SERVICE_ACCEPTANCE_NOT_OVERDUE"
          ? "客户验收仍在确认期内，暂不能由平台确认验收"
          : "平台技术服务验收状态已更新，请刷新后重试",
      );
    }
    const orderShippingReport = await this.orderShippingReporter
      .reportAcceptedOrder({
        order: result.order,
        source: "platform_acceptance",
      });
    const now = this.nowFactory();
    return {
      work_order: serializePlatformWorkOrder(result.workOrder, now),
      order: serializePlatformOrder(result.order, now, orderShippingReport.report),
      acceptance_preparation: serializePlatformAcceptancePreparation(
        result.acceptancePreparation,
        now,
      ),
      wechat_shipping_report: orderShippingReport,
      server_time: now.toISOString(),
    };
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
    this.assertPlatformStaff(authContext);
    if (!hasPermission(authContext, ORDER_READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageWorkOrders(authContext: AuthContext) {
    this.assertPlatformStaff(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, WORK_ORDER_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertCanReviewRefunds(authContext: AuthContext) {
    this.assertPlatformStaff(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, REFUND_REVIEW_PERMISSION)) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertPlatformStaff(authContext: AuthContext) {
    if (
      authContext.tenantId !== null
      || (!authContext.isPlatformStaff && !authContext.isPlatformAdmin)
    ) {
      throw Errors.forbidden();
    }
  }

  private async requireWorkOrder(workOrderId: string) {
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
    return workOrder;
  }
}

function throwBusinessConflict(errorCode: string | undefined, message: string): never {
  throw Errors.business(
    409,
    message,
    errorCode ?? "SERVICE_WORK_ORDER_VERSION_CONFLICT",
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
