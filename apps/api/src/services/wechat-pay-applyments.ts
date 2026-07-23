import { Errors } from "@/errors/error-factory";
import { randomUUID } from "node:crypto";
import { ocrRecognitionRepository } from "@/repositories/ocr-recognitions";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentEventInsert,
  type WechatPayApplymentRecord,
  type WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import { wechatPayConfigRepository } from "@/repositories/wechat-pay-configs";
import type {
  ActivateWechatPayApplymentConfigInput,
  ApproveWechatPayApplymentInput,
  CreateWechatPayApplymentInput,
  MarkWechatPayApplymentApplyingInput,
  PlatformWechatPayApplymentListQuery,
  RepairWechatPayApplymentStateInput,
  RejectWechatPayApplymentInput,
  SubmitWechatPayApplymentInput,
  UpdateWechatPayApplymentInput,
} from "@/schema/wechat-pay-applyments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildDraftAuditDecision,
  buildDraftChangeAudit,
} from "@/services/wechat-pay-applyment-draft-audit";
import {
  buildCreateSensitivePayload,
  buildSensitivePayloadUpdate,
  buildTenantApplymentSafePatch,
  hasSensitiveDraftValues,
  sanitizeApplymentRecord,
} from "@/services/wechat-pay-applyment-draft";
import {
  encryptApplymentSensitivePayload,
} from "@/services/wechat-pay-applyment-sensitive-payload";
import {
  assertApplymentSubmissionContentValid,
  loadCompleteApplymentSensitivePayload,
} from "@/services/wechat-pay-applyment-content-validation";
import { assertApplymentSubmitReady } from "@/services/wechat-pay-applyment-readiness";
import { runWechatPayApplymentPreflight } from "@/services/wechat-pay-applyment-preflight";
import { wechatPayApplymentStatusService } from "@/services/wechat-pay-applyment-status";
import { WechatPayApplymentPlatformActions } from "@/services/wechat-pay-applyments-platform";
import { wechatPayApplymentSubmissionService } from "@/services/wechat-pay-applyment-submission";
import type {
  AccessPolicyPort,
  ApplymentDetailResult,
  WechatPayApplymentRepositoryPort,
  WechatPayConfigRepositoryPort,
  WechatPayApplymentServiceDependencies,
} from "@/services/wechat-pay-applyments-types";
import {
  TENANT_READ_PERMISSION,
  TENANT_SUBMIT_PERMISSION,
} from "@/services/wechat-pay-applyments-types";

export class WechatPayApplymentService {
  private readonly repository: WechatPayApplymentRepositoryPort;
  private readonly configRepository: WechatPayConfigRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly applicationNoFactory: () => string;
  private readonly applymentIdFactory: () => string;
  private readonly encryptionRootSecretFactory: () => string | null | undefined;
  private readonly ocrRecognitionRepository:
    NonNullable<WechatPayApplymentServiceDependencies["ocrRecognitionRepository"]>;
  private readonly nowFactory: () => string;
  private readonly platformActions: WechatPayApplymentPlatformActions;

  constructor(dependencies: WechatPayApplymentServiceDependencies = {}) {
    this.repository = dependencies.repository ?? wechatPayApplymentRepository;
    this.configRepository = dependencies.configRepository ??
      wechatPayConfigRepository;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? accessPolicyService;
    this.applicationNoFactory =
      dependencies.applicationNoFactory ?? createApplicationNo;
    this.applymentIdFactory = dependencies.applymentIdFactory ?? randomUUID;
    this.encryptionRootSecretFactory =
      dependencies.encryptionRootSecretFactory ??
      (() => process.env.APP_CONFIG_ENCRYPTION_KEY);
    this.ocrRecognitionRepository = dependencies.ocrRecognitionRepository ??
      ocrRecognitionRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date().toISOString());
    this.platformActions = new WechatPayApplymentPlatformActions(
      this.repository,
      this.configRepository,
      dependencies.platformPaymentConfigRepository ??
        platformPaymentConfigRepository,
      this.nowFactory,
      dependencies.submissionService ?? wechatPayApplymentSubmissionService,
      dependencies.statusService ?? wechatPayApplymentStatusService,
      this.accessPolicyService,
      dependencies.preflightService ?? {
        run: runWechatPayApplymentPreflight,
      },
    );
  }

  async getCurrent(authContext: AuthContext): Promise<ApplymentDetailResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertTenantRead(authContext);
    const applyment = await this.repository.findLatestByTenant(tenantId);
    if (applyment && ["closed", "suspended"].includes(applyment.status)) {
      return this.toDetail(authContext, null);
    }
    return this.toDetail(authContext, applyment);
  }

  async getTenantDetail(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertTenantRead(authContext);
    const applyment = await this.getRequiredApplyment({ id, tenantId });
    return this.toDetail(authContext, applyment);
  }
  async createDraft(
    authContext: AuthContext,
    input: CreateWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertTenantSubmit(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.repository.findLatestByTenant(tenantId);
    if (current && !["closed", "suspended"].includes(current.status)) {
      throw Errors.business(
        409,
        "当前租户已有微信支付开通申请",
        "WECHAT_PAY_APPLYMENT_EXISTS",
        { applyment_id: current.id, status: current.status },
      );
    }

    const applymentId = this.applymentIdFactory();
    const now = this.nowFactory();
    const sensitivePayload = buildCreateSensitivePayload(input);
    const hasSensitivePayload = hasSensitiveDraftValues(sensitivePayload);
    const sensitivePatch: WechatPayApplymentUpdate = hasSensitivePayload
      ? {
        has_sensitive_payload: true,
        sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
          context: { tenantId, applymentId, version: 1 },
          payload: sensitivePayload,
          rootSecret: this.encryptionRootSecretFactory(),
        }),
        sensitive_payload_version: 1,
        sensitive_payload_updated_at: now,
      }
      : {
        has_sensitive_payload: false,
        sensitive_payload_ciphertext: null,
        sensitive_payload_version: null,
        sensitive_payload_updated_at: null,
      };
    const created = await this.repository.createApplyment({
      ...buildTenantApplymentSafePatch(input),
      ...sensitivePatch,
      id: applymentId,
      tenant_id: tenantId,
      application_no: this.applicationNoFactory(),
      merchant_short_name: input.merchant_short_name ?? null,
      status: "draft",
      applyment_state: "draft",
      appid_binding_state: "not_bound",
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    });
    await this.recordEvent({
      applyment: created,
      eventType: "created",
      fromStatus: null,
      toStatus: "draft",
      message: "租户创建微信支付开通申请草稿",
      operatorEmployeeId: employeeId,
      metadata: buildDraftChangeAudit(input),
    });

    return this.toDetail(authContext, created);
  }

  async updateDraft(
    authContext: AuthContext,
    id: string,
    input: UpdateWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertTenantSubmit(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id, tenantId });
    this.assertEditable(current);

    const sensitivePatch = await buildSensitivePayloadUpdate({
      current,
      input,
      tenantId,
      loadSensitivePayload: () => this.repository.findSensitivePayloadById({
        id: current.id,
        tenantId,
      }),
      rootSecret: this.encryptionRootSecretFactory(),
      now: this.nowFactory(),
    });
    const audit = buildDraftAuditDecision({ current, input });
    const updated = await this.repository.updateApplyment({
      id,
      tenantId,
      patch: {
        ...buildTenantApplymentSafePatch(input),
        ...sensitivePatch,
        status: "draft",
        applyment_state: "draft",
        rejected_reason: null,
        rejected_at: null,
        updated_by_employee_id: employeeId,
      },
    });
    if (audit.should_audit) {
      await this.recordEvent({
        applyment: updated,
        eventType: "updated",
        fromStatus: current.status,
        toStatus: updated.status,
        message: "租户更新微信支付开通申请资料",
        operatorEmployeeId: employeeId,
        metadata: audit.metadata,
      });
    }

    return this.toDetail(authContext, updated);
  }

  async submit(
    authContext: AuthContext,
    id: string,
    input: SubmitWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertTenantSubmit(authContext);
    const employeeId = this.requireEmployee(authContext);
    if (input.idempotency_key !== id) {
      throw Errors.business(409, "提交幂等键与申请不匹配", "WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH");
    }
    const current = await this.getRequiredApplyment({ id, tenantId });
    const editable = ["draft", "rejected", "wechat_editing"].includes(current.status);
    if (!editable && current.submitted_at) {
      return this.toDetail(authContext, current);
    }
    this.assertEditable(current);
    assertApplymentSubmitReady(current);
    await loadCompleteApplymentSensitivePayload({
      applyment: current,
      repository: this.repository,
      rootSecret: this.encryptionRootSecretFactory(),
    });
    await assertApplymentSubmissionContentValid({
      applyment: current,
      ocrRecognitionRepository: this.ocrRecognitionRepository,
    });
    const updated = await this.repository.submitTenantApplymentAtomically({
      applymentId: id,
      tenantId,
      employeeId,
      idempotencyKey: input.idempotency_key,
      expectedUpdatedAt: current.updated_at,
      remark: input.remark ?? null,
    });

    return this.toDetail(authContext, updated);
  }

  async listForPlatform(
    authContext: AuthContext,
    query: PlatformWechatPayApplymentListQuery,
  ) {
    return this.platformActions.listForPlatform(authContext, query);
  }

  async getPlatformDetail(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.getPlatformDetail(authContext, id);
  }

  async approve(
    authContext: AuthContext,
    id: string,
    input: ApproveWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.approve(authContext, id, input);
  }

  async reject(
    authContext: AuthContext,
    id: string,
    input: RejectWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.reject(authContext, id, input);
  }

  async markApplying(
    authContext: AuthContext,
    id: string,
    input: MarkWechatPayApplymentApplyingInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.markApplying(authContext, id, input);
  }

  async submitToWechat(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.submitToWechat(authContext, id);
  }

  async syncWechatStatus(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.syncWechatStatus(authContext, id);
  }

  async repairWechatState(
    authContext: AuthContext,
    id: string,
    input: RepairWechatPayApplymentStateInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.repairWechatState(authContext, id, input);
  }

  async activateConfig(
    authContext: AuthContext,
    id: string,
    _input: ActivateWechatPayApplymentConfigInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.activateConfig(authContext, id);
  }

  private async toDetail(
    authContext: AuthContext,
    applyment: WechatPayApplymentRecord | null,
  ): Promise<ApplymentDetailResult> {
    return {
      applyment: applyment ? sanitizeApplymentRecord(applyment) : null,
      events: applyment
        ? await this.repository.findEvents({
          tenantId: applyment.tenant_id,
          applymentId: applyment.id,
        })
        : [],
      can_submit: Boolean(applyment) &&
        this.canTenantSubmit(authContext) &&
        ["draft", "rejected", "wechat_editing"].includes(
          applyment?.status ?? "",
        ),
      available_actions: [],
    };
  }

  private assertTenantRead(authContext: AuthContext) {
    if (this.canTenantSubmit(authContext)) return;
    if (!this.accessPolicyService.hasPermission(authContext, TENANT_READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertTenantSubmit(authContext: AuthContext) {
    if (!this.canTenantSubmit(authContext)) {
      throw Errors.forbidden();
    }
  }

  private canTenantSubmit(authContext: AuthContext) {
    return this.accessPolicyService.hasPermission(
      authContext,
      TENANT_SUBMIT_PERMISSION,
    );
  }

  private requireEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private async getRequiredApplyment(input: {
    id: string;
    tenantId?: string;
  }) {
    const applyment = await this.repository.findById(input);
    if (!applyment) {
      throw Errors.business(
        404,
        "微信支付开通申请不存在",
        "WECHAT_PAY_APPLYMENT_NOT_FOUND",
      );
    }
    return applyment;
  }

  private assertEditable(applyment: WechatPayApplymentRecord) {
    if (!["draft", "rejected", "wechat_editing"].includes(applyment.status)) {
      throw Errors.business(
        409,
        "当前申请状态不能由租户修改",
        "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
        { status: applyment.status },
      );
    }
  }

  private async recordEvent(input: {
    applyment: WechatPayApplymentRecord;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    message: string | null;
    operatorEmployeeId: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await this.repository.insertEvent({
      tenant_id: input.applyment.tenant_id,
      applyment_id: input.applyment.id,
      event_type: input.eventType,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      message: input.message,
      operator_employee_id: input.operatorEmployeeId,
      metadata: (input.metadata ?? {}) as WechatPayApplymentEventInsert["metadata"],
    });
  }
}

function createApplicationNo() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WPA${timestamp}${suffix}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export const wechatPayApplymentService = new WechatPayApplymentService();
