import { Errors } from "@/errors/error-factory";
import {
  supplierPaymentRequestsRepository,
  type SupplierPaymentRequestDetail,
} from "@/repositories/supplier-payment-requests";
import {
  supplierPaymentEvidenceFilesRepository,
} from "@/repositories/supplier-payment-evidence-files";
import type {
  SupplierPaymentCommandEnvelope,
} from "@/repositories/supplier-payment-records";
import type {
  SupplierPaymentConfirmInput,
  SupplierPaymentListQuery,
  SupplierPaymentRequestCancelInput,
  SupplierPaymentRequestCloseInput,
  SupplierPaymentRequestDraftInput,
  SupplierPaymentRequestListQuery,
  SupplierPaymentRequestReviewInput,
  SupplierPaymentRequestSubmitInput,
} from "@/schema/supplier-payments";
import type { AuthContext } from "@/services/authorization";
import {
  supplierPaymentAccessService,
} from "@/services/supplier-payment-access";

type AccessPort = Pick<
  typeof supplierPaymentAccessService,
  | "requireRequestRead"
  | "requireRequestManage"
  | "requireRequestApprove"
  | "requirePayment"
  | "getVisibleProjectIds"
  | "assertProjectRead"
  | "assertProjectUpdate"
>;
type RepositoryPort = Pick<
  typeof supplierPaymentRequestsRepository,
  | "list"
  | "detail"
  | "listPayments"
  | "saveDraft"
  | "submit"
  | "review"
  | "cancel"
  | "close"
  | "confirmPayment"
>;
type FileRepositoryPort = Pick<
  typeof supplierPaymentEvidenceFilesRepository,
  "findActiveByObjectKeys"
>;
type CommandScope = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};
type RequestSuccessStatus =
  | "saved"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "closed";
type PaymentSuccessStatus = "partially_paid" | "paid";
type CommandSuccessStatus = RequestSuccessStatus | PaymentSuccessStatus;
type CommandErrorStatus = Exclude<
  SupplierPaymentCommandEnvelope["status"],
  CommandSuccessStatus
>;

export type SupplierPaymentRequestsServiceDependencies = {
  access?: AccessPort;
  repository?: RepositoryPort;
  fileRepository?: FileRepositoryPort;
};

const ERROR_MESSAGES: Record<CommandErrorStatus, string> = {
  not_found: "供应商付款申请不存在",
  validation_error: "供应商付款参数校验失败",
  state_conflict: "付款申请当前状态不允许该操作",
  version_conflict: "付款申请版本已变化，请刷新后重试",
  scope_mismatch: "付款申请的项目或供应商范围不匹配",
  amount_unavailable: "可付款或可申请金额不足",
  allocation_invalid: "付款分配明细无效",
  evidence_required: "付款凭证不能为空",
  invoice_required: "当前应付要求先登记发票",
  self_review: "申请人不能审批自己提交的付款申请",
  idempotency_conflict: "幂等键已用于其他付款操作",
};
const ERROR_CODES: Record<CommandErrorStatus, string> = {
  not_found: "SUPPLIER_PAYMENT_REQUEST_NOT_FOUND",
  validation_error: "SUPPLIER_PAYMENT_VALIDATION_ERROR",
  state_conflict: "SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT",
  version_conflict: "SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT",
  scope_mismatch: "SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH",
  amount_unavailable: "SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE",
  allocation_invalid: "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
  evidence_required: "SUPPLIER_PAYMENT_EVIDENCE_REQUIRED",
  invoice_required: "SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED",
  self_review: "SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN",
  idempotency_conflict: "SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT",
};

export class SupplierPaymentRequestsService {
  private readonly access: AccessPort;
  private readonly repository: RepositoryPort;
  private readonly fileRepository: FileRepositoryPort;

  constructor(dependencies: SupplierPaymentRequestsServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierPaymentAccessService;
    this.repository = dependencies.repository ??
      supplierPaymentRequestsRepository;
    this.fileRepository = dependencies.fileRepository ??
      supplierPaymentEvidenceFilesRepository;
  }

  async list(auth: AuthContext, query: SupplierPaymentRequestListQuery) {
    const scope = await this.access.requireRequestRead(auth);
    const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
    return this.repository.list({
      tenant_id: scope.tenantId,
      visible_project_ids: visibleProjectIds,
      ...query,
    });
  }

  async detail(auth: AuthContext, paymentRequestId: string) {
    const scope = await this.access.requireRequestRead(auth);
    const detail = await this.requireDetail(scope.tenantId, paymentRequestId);
    await this.access.assertProjectRead(
      auth,
      detail.payment_request.project_id,
    );
    return detail;
  }

  async listPayments(
    auth: AuthContext,
    paymentRequestId: string,
    query: SupplierPaymentListQuery,
  ) {
    const scope = await this.access.requireRequestRead(auth);
    const detail = await this.requireDetail(scope.tenantId, paymentRequestId);
    await this.access.assertProjectRead(
      auth,
      detail.payment_request.project_id,
    );
    return this.repository.listPayments({
      tenant_id: scope.tenantId,
      payment_request_id: paymentRequestId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async saveDraft(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestDraftInput,
    idempotencyKey: string,
  ) {
    if (paymentRequestId !== input.id) {
      throw Errors.business(
        409,
        "路径中的付款申请 ID 与请求体不一致",
        "SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH",
      );
    }
    const scope = await this.access.requireRequestManage(auth);
    if (input.expected_version > 0) {
      const detail = await this.requireDetail(
        scope.tenantId,
        paymentRequestId,
      );
      await this.access.assertProjectUpdate(
        auth,
        detail.payment_request.project_id,
      );
    }
    await this.access.assertProjectUpdate(auth, input.project_id);
    return this.execute(
      this.repository.saveDraft({
        ...commandContext(scope, paymentRequestId, input, idempotencyKey),
        project_id: input.project_id,
        tenant_supplier_id: input.tenant_supplier_id,
        reason: input.reason,
        remark: normalizeOptionalRemark(input.remark),
        allocations: input.allocations,
      }),
      ["saved"],
      "保存供应商付款申请草稿失败",
    );
  }

  async submit(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestSubmitInput,
    idempotencyKey: string,
  ) {
    const { scope } = await this.requireWritable(
      auth,
      paymentRequestId,
      "manage",
    );
    return this.execute(
      this.repository.submit(
        commandContext(scope, paymentRequestId, input, idempotencyKey),
      ),
      ["submitted"],
      "提交供应商付款申请失败",
    );
  }

  approve(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestReviewInput,
    idempotencyKey: string,
  ) {
    return this.review(auth, paymentRequestId, input, idempotencyKey, "approve");
  }

  reject(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestReviewInput,
    idempotencyKey: string,
  ) {
    return this.review(auth, paymentRequestId, input, idempotencyKey, "reject");
  }

  async cancel(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestCancelInput,
    idempotencyKey: string,
  ) {
    const { scope } = await this.requireWritable(
      auth,
      paymentRequestId,
      "manage",
    );
    return this.execute(
      this.repository.cancel({
        ...commandContext(scope, paymentRequestId, input, idempotencyKey),
        reason: input.reason,
      }),
      ["cancelled"],
      "取消供应商付款申请失败",
    );
  }

  async close(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestCloseInput,
    idempotencyKey: string,
  ) {
    const { scope } = await this.requireWritable(
      auth,
      paymentRequestId,
      "manage",
    );
    return this.execute(
      this.repository.close({
        ...commandContext(scope, paymentRequestId, input, idempotencyKey),
        reason: input.reason,
      }),
      ["closed"],
      "关闭供应商付款申请失败",
    );
  }

  async confirmPayment(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentConfirmInput,
    idempotencyKey: string,
  ) {
    const { scope } = await this.requireWritable(
      auth,
      paymentRequestId,
      "pay",
    );
    await this.assertPaymentEvidence(scope, input.evidence_images);
    return this.execute(
      this.repository.confirmPayment({
        ...commandContext(scope, paymentRequestId, input, idempotencyKey),
        payment_id: input.id,
        payment_method: input.payment_method,
        payment_reference: input.payment_reference,
        paid_at: input.paid_at,
        evidence_images: input.evidence_images,
        remark: normalizeOptionalRemark(input.remark),
        allocations: input.allocations,
      }),
      ["partially_paid", "paid"],
      "确认供应商付款失败",
    );
  }

  private async assertPaymentEvidence(
    scope: CommandScope,
    evidenceImages: string[],
  ): Promise<void> {
    const objectKeys = [...new Set(evidenceImages)];
    if (
      objectKeys.length < 1 || objectKeys.length > 9 ||
      objectKeys.length !== evidenceImages.length
    ) {
      this.throwInvalidPaymentEvidence();
    }
    const files = await this.fileRepository.findActiveByObjectKeys({
      objectKeys,
      tenantId: scope.tenantId,
      limit: 9,
    });
    const fileByObjectKey = new Map(
      files.map((file) => [file.object_key, file]),
    );
    for (const objectKey of objectKeys) {
      const file = fileByObjectKey.get(objectKey);
      if (
        !file ||
        file.tenant_id !== scope.tenantId ||
        file.scene !== "expense_request" ||
        file.status !== "active" ||
        file.deleted_at !== null ||
        file.created_by_employee_id !== scope.employeeId
      ) {
        this.throwInvalidPaymentEvidence();
      }
    }
  }

  private throwInvalidPaymentEvidence(): never {
    throw Errors.business(
      400,
      "付款凭证与当前员工上传的有效租户文件不匹配",
      "SUPPLIER_PAYMENT_EVIDENCE_FILE_INVALID",
    );
  }

  private async review(
    auth: AuthContext,
    paymentRequestId: string,
    input: SupplierPaymentRequestReviewInput,
    idempotencyKey: string,
    action: "approve" | "reject",
  ) {
    const { scope } = await this.requireWritable(
      auth,
      paymentRequestId,
      "approve",
    );
    return this.execute(
      this.repository.review({
        ...commandContext(scope, paymentRequestId, input, idempotencyKey),
        action,
        remark: input.remark ?? null,
      }),
      [action === "approve" ? "approved" : "rejected"],
      action === "approve"
        ? "审批供应商付款申请失败"
        : "驳回供应商付款申请失败",
    );
  }

  private async requireWritable(
    auth: AuthContext,
    paymentRequestId: string,
    permission: "manage" | "approve" | "pay",
  ) {
    const scope = permission === "manage"
      ? await this.access.requireRequestManage(auth)
      : permission === "approve"
      ? await this.access.requireRequestApprove(auth)
      : await this.access.requirePayment(auth);
    const detail = await this.requireDetail(scope.tenantId, paymentRequestId);
    await this.access.assertProjectUpdate(
      auth,
      detail.payment_request.project_id,
    );
    return { scope, detail };
  }

  private async requireDetail(
    tenantId: string,
    paymentRequestId: string,
  ): Promise<SupplierPaymentRequestDetail> {
    const detail = await this.repository.detail(tenantId, paymentRequestId);
    if (detail) return detail;
    throw Errors.business(
      409,
      "供应商付款申请不存在",
      "SUPPLIER_PAYMENT_REQUEST_NOT_FOUND",
    );
  }

  private async execute(
    pending: Promise<SupplierPaymentCommandEnvelope>,
    expected: readonly CommandSuccessStatus[],
    message: string,
  ) {
    const envelope = await pending;
    if ("error_code" in envelope) {
      throw Errors.business(
        409,
        ERROR_MESSAGES[envelope.status],
        ERROR_CODES[envelope.status],
      );
    }
    if (!expected.includes(envelope.status)) {
      throw Errors.dbError(message, envelope);
    }
    return envelope;
  }
}

function commandContext(
  scope: CommandScope,
  paymentRequestId: string,
  input: { expected_version: number },
  idempotencyKey: string,
) {
  return {
    tenant_id: scope.tenantId,
    payment_request_id: paymentRequestId,
    expected_version: input.expected_version,
    actor_user_id: scope.authUserId,
    actor_employee_id: scope.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function normalizeOptionalRemark(
  value: string | null | undefined,
): string | null {
  return value === undefined || value === null || value.length === 0
    ? null
    : value;
}

export const supplierPaymentRequestsService =
  new SupplierPaymentRequestsService();
