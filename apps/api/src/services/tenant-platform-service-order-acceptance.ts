import { Errors } from "@/errors/error-factory";
import type {
  AcceptancePreparationRecord,
  AtomicActionResult,
  OrderRecord,
  TenantServiceAcceptanceViewRecord,
  WorkOrderRecord,
} from "@/repositories/platform-service-order-records";
import type {
  FulfillmentAttachmentPreviewFileRecord,
  FulfillmentAttachmentPreviewRecord,
} from "@/repositories/platform-service-fulfillment-attachment-preview-records";
import type { ServiceAcceptanceDecisionInput } from "@/schema/billing-service-orders";
import type { AuthContext } from "@/services/authorization";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import {
  platformServiceOrderShippingService,
  type OrderShippingReportResult,
} from "@/services/platform-service-order-shipping";
import { serializeTenantServiceOrder } from "@/services/platform-service-order-views";

type AcceptanceRepositoryPort = {
  findAcceptanceViewByTenantAndOrderId: (input: {
    tenantId: string;
    orderId: string;
  }) => Promise<TenantServiceAcceptanceViewRecord | null>;
  findTenantFulfillmentAttachmentPreview: (input: {
    tenantId: string;
    orderId: string;
    attachmentId: string;
  }) => Promise<FulfillmentAttachmentPreviewRecord | null>;
  decideAcceptance: (input: {
    tenantId: string;
    serviceOrderId: string;
    decision: "accepted" | "rejected";
    expectedWorkOrderVersion: number;
    operatorEmployeeId: string;
    remark?: string;
  }) => Promise<AtomicActionResult>;
};

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

type AcceptanceDependencies = {
  repository: AcceptanceRepositoryPort;
  accessPolicyService: AccessPolicyPort;
  nowFactory: () => Date;
  orderShippingReporter?: {
    reportAcceptedOrder: (input: {
      order: OrderRecord;
      source: "tenant_acceptance";
    }) => Promise<OrderShippingReportResult>;
  };
  signedUrlResolver?: (
    objectKey: string,
    options: { ttlSeconds: number },
  ) => Promise<string>;
};

const CREATE_PERMISSION = "billing.service_order.create";
const READ_PERMISSION = "billing.service_order.read";
const FULFILLMENT_ATTACHMENT_SCENE = "tenant_service_fulfillment_attachment";
const PREVIEW_TTL_SECONDS = 600;

export async function getTenantServiceOrderAcceptance(
  dependencies: AcceptanceDependencies,
  authContext: AuthContext,
  orderId: string,
) {
  const tenantId = assertCanRead(dependencies.accessPolicyService, authContext);
  const view = await dependencies.repository.findAcceptanceViewByTenantAndOrderId({
    tenantId,
    orderId,
  });
  if (!view) {
    throw Errors.business(
      404,
      "平台服务订单不存在",
      "SERVICE_ORDER_NOT_FOUND",
    );
  }
  return serializeAcceptanceView(
    view,
    dependencies.nowFactory(),
    dependencies.accessPolicyService.hasPermission(
      authContext,
      CREATE_PERMISSION,
    ),
  );
}

export async function decideTenantServiceOrderAcceptance(
  dependencies: AcceptanceDependencies,
  authContext: AuthContext,
  orderId: string,
  input: ServiceAcceptanceDecisionInput,
  decision: "accepted" | "rejected",
) {
  const tenantId = assertCanCreate(dependencies.accessPolicyService, authContext);
  const employeeId = requireEmployee(authContext);
  const result = await dependencies.repository.decideAcceptance({
    tenantId,
    serviceOrderId: orderId,
    decision,
    expectedWorkOrderVersion: input.expected_work_order_version,
    operatorEmployeeId: employeeId,
    remark: input.remark,
  });
  if (!result.workOrder || !result.order || !result.acceptancePreparation) {
    throw Errors.business(
      409,
      "平台服务验收状态已更新，请刷新后重试",
      result.errorCode ?? "SERVICE_ACCEPTANCE_INVALID_STATE",
    );
  }
  if (decision === "accepted" && (!result.contract || !result.contractPeriod)) {
    throw Errors.business(
      409,
      "平台服务验收状态已更新，请刷新后重试",
      result.errorCode ?? "SERVICE_ACCEPTANCE_INVALID_STATE",
    );
  }
  const orderShippingReport = decision === "accepted"
    ? await reportAcceptedOrderShipping(dependencies, result.order)
    : null;
  const responseNow = dependencies.nowFactory();
  return {
    order: serializeTenantServiceOrder(result.order, responseNow, {
      canCancelPayment: true,
    }),
    work_order: serializeWorkOrder(result.workOrder),
    acceptance_preparation: serializeAcceptancePreparation(
      result.acceptancePreparation,
      responseNow,
    ),
    contract: decision === "accepted" ? result.contract : null,
    contract_period: decision === "accepted" ? result.contractPeriod : null,
    idempotent: result.idempotent === true,
    wechat_shipping_report: orderShippingReport,
    server_time: responseNow.toISOString(),
  };
}

export async function getTenantServiceFulfillmentAttachmentPreviewUrl(
  dependencies: AcceptanceDependencies,
  authContext: AuthContext,
  orderId: string,
  attachmentId: string,
) {
  const tenantId = assertCanRead(dependencies.accessPolicyService, authContext);
  const attachment = await dependencies.repository
    .findTenantFulfillmentAttachmentPreview({
      tenantId,
      orderId,
      attachmentId,
    });
  const file = normalizeMaybeSingleRelation(attachment?.file);
  if (
    !attachment ||
    !file ||
    !isPreviewableFulfillmentAttachment(tenantId, attachment, file)
  ) {
    throw Errors.business(
      404,
      "平台服务履约附件不存在",
      "SERVICE_FULFILLMENT_ATTACHMENT_NOT_FOUND",
    );
  }

  const resolver = dependencies.signedUrlResolver ?? resolveSignedStoredFileUrl;
  const previewUrl = await resolver(file.object_key, {
    ttlSeconds: PREVIEW_TTL_SECONDS,
  });
  const responseNow = dependencies.nowFactory();
  return {
    preview_url: previewUrl,
    ttl_seconds: PREVIEW_TTL_SECONDS,
    expires_at: new Date(
      responseNow.getTime() + PREVIEW_TTL_SECONDS * 1000,
    ).toISOString(),
    file: {
      id: attachment.file_id,
      attachment_id: attachment.id,
      file_name: attachment.file_name ?? file.original_name ?? null,
      mime_type: attachment.mime_type ?? file.mime_type ?? null,
      size_bytes: attachment.size_bytes ?? file.size_bytes ?? null,
    },
    server_time: responseNow.toISOString(),
  };
}

function assertCanRead(
  accessPolicyService: AccessPolicyPort,
  authContext: AuthContext,
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  if (
    !accessPolicyService.hasPermission(authContext, READ_PERMISSION) &&
    !accessPolicyService.hasPermission(authContext, CREATE_PERMISSION)
  ) {
    throw Errors.forbidden();
  }
  return tenantId;
}

function assertCanCreate(
  accessPolicyService: AccessPolicyPort,
  authContext: AuthContext,
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  if (!accessPolicyService.hasPermission(authContext, CREATE_PERMISSION)) {
    throw Errors.forbidden();
  }
  return tenantId;
}

function requireEmployee(authContext: AuthContext) {
  if (!authContext.employeeId) throw Errors.forbidden();
  return authContext.employeeId;
}

async function reportAcceptedOrderShipping(
  dependencies: AcceptanceDependencies,
  order: OrderRecord,
) {
  const reporter = dependencies.orderShippingReporter ??
    platformServiceOrderShippingService;
  try {
    return await reporter.reportAcceptedOrder({
      order,
      source: "tenant_acceptance",
    });
  } catch (error) {
    return {
      status: "failed",
      idempotent: false,
      report: null,
      error_code: stableErrorCode(error),
      skipped_reason: null,
    } satisfies OrderShippingReportResult;
  }
}

function stableErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && code.trim()) return code.slice(0, 100);
  }
  return "WECHAT_ORDER_SHIPPING_REPORT_FAILED";
}

function isPreviewableFulfillmentAttachment(
  tenantId: string,
  attachment: FulfillmentAttachmentPreviewRecord,
  file: FulfillmentAttachmentPreviewFileRecord,
) {
  return Boolean(
    attachment.tenant_id === tenantId &&
      (file.tenant_id === tenantId || file.tenant_id === null) &&
      file.id === attachment.file_id &&
      file.scene === FULFILLMENT_ATTACHMENT_SCENE &&
      file.provider === "tencent_cos" &&
      file.visibility === "private" &&
      file.status === "active" &&
      file.deleted_at === null &&
      file.object_key.trim()
  );
}

function serializeAcceptanceView(
  record: TenantServiceAcceptanceViewRecord,
  now: Date,
  canCancelPayment: boolean,
) {
  const workOrder = normalizeMaybeSingleRelation(record.work_orders);
  const acceptancePreparation = normalizeMaybeSingleRelation(
    record.acceptance_preparations,
  );
  return {
    order: serializeTenantServiceOrder(record, now, { canCancelPayment }),
    work_order: workOrder ? serializeWorkOrder(workOrder) : null,
    acceptance_preparation: acceptancePreparation
      ? serializeAcceptancePreparation(acceptancePreparation, now)
      : null,
    fulfillment_records: normalizeList(record.fulfillment_records).map((
      fulfillmentRecord,
    ) => ({
      id: fulfillmentRecord.id,
      record_type: fulfillmentRecord.record_type,
      title: fulfillmentRecord.title,
      content: fulfillmentRecord.content,
      occurred_at: fulfillmentRecord.occurred_at,
      created_at: fulfillmentRecord.created_at,
      attachments: normalizeList(fulfillmentRecord.attachments).map((
        attachment,
      ) => {
        const file = normalizeMaybeSingleRelation(attachment.file);
        return {
          id: attachment.id,
          file_id: attachment.file_id,
          file_name: attachment.file_name ?? file?.original_name ?? null,
          mime_type: attachment.mime_type ?? file?.mime_type ?? null,
          size_bytes: attachment.size_bytes ?? file?.size_bytes ?? null,
          created_at: attachment.created_at,
        };
      }),
    })),
    available_actions: getAcceptanceActions(
      record,
      workOrder,
      acceptancePreparation,
    ),
    server_time: now.toISOString(),
  };
}

function serializeWorkOrder(workOrder: WorkOrderRecord) {
  return {
    id: workOrder.id,
    tenant_id: workOrder.tenant_id,
    service_order_id: workOrder.service_order_id,
    order_no: workOrder.order_no,
    status: workOrder.status,
    assignee_employee_id: workOrder.assignee_employee_id,
    version: workOrder.version ?? 1,
    created_at: workOrder.created_at,
    updated_at: workOrder.updated_at,
  };
}

function serializeAcceptancePreparation(
  acceptancePreparation: AcceptancePreparationRecord,
  now: Date,
) {
  const dueAt = acceptancePreparation.acceptance_due_at;
  const remainingSeconds = getRemainingSeconds(dueAt, now);
  return {
    id: acceptancePreparation.id,
    status: acceptancePreparation.status,
    summary: acceptancePreparation.summary,
    prepared_at: acceptancePreparation.prepared_at,
    submitted_at: acceptancePreparation.submitted_at,
    acceptance_due_at: dueAt,
    acceptance_overdue: dueAt ? remainingSeconds === 0 : false,
    acceptance_remaining_seconds: remainingSeconds,
    created_at: acceptancePreparation.created_at,
    updated_at: acceptancePreparation.updated_at,
  };
}

function getAcceptanceActions(
  order: OrderRecord,
  workOrder: WorkOrderRecord | null,
  acceptancePreparation: AcceptancePreparationRecord | null,
) {
  const enabled = order.payment_status === "paid" &&
    workOrder?.status === "awaiting_acceptance" &&
    acceptancePreparation?.status === "submitted";
  const disabledReason = enabled ? null : "当前服务暂不可验收";
  return {
    accept: {
      enabled,
      label: "确认验收",
      disabled_reason: disabledReason,
    },
    reject: {
      enabled,
      label: "要求整改",
      disabled_reason: disabledReason,
    },
  };
}

function normalizeMaybeSingleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeList<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getRemainingSeconds(dueAt: string | null, now: Date) {
  if (!dueAt) return null;
  const dueTime = new Date(dueAt).getTime();
  if (!Number.isFinite(dueTime)) return null;
  return Math.max(0, Math.floor((dueTime - now.getTime()) / 1000));
}
