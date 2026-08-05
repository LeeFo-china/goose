import { Errors } from "@/errors/error-factory";
import {
  platformBillingRechargeRefundRepository,
  type PlatformRechargeRefundRequestRecord,
  type PlatformRechargeRefundRequestReviewStatus,
} from "@/repositories/platform-billing-recharge-refunds";
import type { TenantCreditRefundRequestStatus } from "@/repositories/billing-recharge-refunds";
import type {
  PlatformRechargeRefundRequestQuery,
  PlatformRechargeRefundReviewInput,
} from "@/schema/platform-billing-recharge-refunds";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import {
  PlatformBillingRechargeRefundExecutionService,
  platformBillingRechargeRefundExecutionService,
  type PlatformBillingRechargeRefundExecutionServiceDependencies,
} from "@/services/platform-billing-recharge-refund-execution";

type RepositoryPort = Pick<
  typeof platformBillingRechargeRefundRepository,
  "listRequests" | "findRequestById" | "reviewRequest" | "markOrderRefundStatus"
>;

type AuditLogServicePort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type ExecutionServicePort = Pick<
  typeof platformBillingRechargeRefundExecutionService,
  "execute"
>;

type PlatformBillingRechargeRefundServiceDependencies = {
  repository?: RepositoryPort;
  auditLogService?: AuditLogServicePort;
  executionService?: ExecutionServicePort;
  executionDependencies?: PlatformBillingRechargeRefundExecutionServiceDependencies;
  nowFactory?: () => Date;
};

const READ_PERMISSION = "platform.billing.recharge_refund.read";
const REVIEW_PERMISSION = "platform.billing.recharge_refund.review";

export class PlatformBillingRechargeRefundService {
  private readonly repository: RepositoryPort;
  private readonly auditLogService: AuditLogServicePort;
  private readonly executionService: ExecutionServicePort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: PlatformBillingRechargeRefundServiceDependencies = {},
  ) {
    this.repository =
      dependencies.repository ?? platformBillingRechargeRefundRepository;
    this.auditLogService =
      dependencies.auditLogService ?? platformAuditLogService;
    this.executionService = dependencies.executionService ??
      (
        dependencies.executionDependencies
          ? new PlatformBillingRechargeRefundExecutionService(
            dependencies.executionDependencies,
          )
          : platformBillingRechargeRefundExecutionService
      );
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async list(
    authContext: AuthContext,
    query: PlatformRechargeRefundRequestQuery,
  ) {
    this.assertCanRead(authContext);
    return this.repository.listRequests({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
    });
  }

  async get(authContext: AuthContext, requestId: string) {
    this.assertCanRead(authContext);
    const request = await this.repository.findRequestById(requestId);
    if (!request) throw requestNotFoundError();
    return { request };
  }

  async approve(
    authContext: AuthContext,
    requestId: string,
    input: PlatformRechargeRefundReviewInput,
  ) {
    return this.review(authContext, requestId, input, {
      action: "approve",
      status: "approved",
      fromStatuses: ["pending_review"],
    });
  }

  async reject(
    authContext: AuthContext,
    requestId: string,
    input: PlatformRechargeRefundReviewInput,
  ) {
    return this.review(authContext, requestId, input, {
      action: "reject",
      status: "rejected",
      fromStatuses: ["pending_review", "approved"],
    });
  }

  async execute(authContext: AuthContext, requestId: string) {
    return this.executionService.execute(authContext, requestId);
  }

  private async review(
    authContext: AuthContext,
    requestId: string,
    input: PlatformRechargeRefundReviewInput,
    decision: {
      action: "approve" | "reject";
      status: PlatformRechargeRefundRequestReviewStatus;
      fromStatuses: TenantCreditRefundRequestStatus[];
    },
  ) {
    const employeeId = this.assertCanReview(authContext);
    const current = await this.repository.findRequestById(requestId);
    if (!current) throw requestNotFoundError();
    if (!decision.fromStatuses.includes(current.status)) {
      throw invalidReviewStateError();
    }

    const reviewedAt = this.nowFactory().toISOString();
    const request = await this.repository.reviewRequest({
      id: requestId,
      fromStatuses: decision.fromStatuses,
      status: decision.status,
      reviewedByEmployeeId: employeeId,
      reviewedAt,
      reviewNote: input.review_note.trim(),
    });
    if (!request) throw invalidReviewStateError();

    await this.repository.markOrderRefundStatus({
      tenantId: request.tenant_id,
      orderId: request.order_id,
      refundStatus: decision.status,
    });
    await this.auditReview(authContext, current, request, decision.action);

    return { request };
  }

  private assertCanRead(authContext: AuthContext) {
    this.assertPlatformContext(authContext);
    if (!hasPermission(authContext, READ_PERMISSION)) throw Errors.forbidden();
  }

  private assertCanReview(authContext: AuthContext) {
    this.assertPlatformContext(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    if (!hasPermission(authContext, REVIEW_PERMISSION)) throw Errors.forbidden();
    return authContext.employeeId;
  }

  private assertPlatformContext(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
  }

  private auditReview(
    authContext: AuthContext,
    before: PlatformRechargeRefundRequestRecord,
    after: PlatformRechargeRefundRequestRecord,
    action: "approve" | "reject",
  ) {
    return this.auditLogService.recordBestEffort({
      action: action === "approve"
        ? "platform_billing_recharge_refund_approve"
        : "platform_billing_recharge_refund_reject",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: after.tenant_id,
      resourceType: "tenant_credit_refund_request",
      resourceId: after.id,
      resourceLabel: after.request_no,
      summary: action === "approve"
        ? "审核通过积分充值退款申请"
        : "驳回积分充值退款申请",
      metadata: {
        before_status: before.status,
        after_status: after.status,
        order_id: after.order_id,
        order_no: after.order?.order_no ?? null,
        review_note: after.review_note,
      },
    });
  }
}

function hasPermission(authContext: AuthContext, permissionCode: string) {
  return authContext.permissions.some((permission) =>
    permission.code === permissionCode
  );
}

function requestNotFoundError() {
  return Errors.business(
    404,
    "积分充值退款申请不存在",
    "BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND",
  );
}

function invalidReviewStateError() {
  return Errors.business(
    409,
    "积分充值退款申请状态已变化，请刷新后重试",
    "BILLING_RECHARGE_REFUND_REVIEW_STATE_INVALID",
  );
}

export const platformBillingRechargeRefundService =
  new PlatformBillingRechargeRefundService();
