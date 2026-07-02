import { Errors } from "@/errors/error-factory";
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
  RejectWechatPayApplymentInput,
  SubmitWechatPayApplymentInput,
  UpdateWechatPayApplymentInput,
  UpdateWechatPayApplymentWechatStatusInput,
} from "@/schema/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { WechatPayApplymentPlatformActions } from "@/services/wechat-pay-applyments-platform";
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

const REQUIRED_APPLYMENT_ATTACHMENT_CATEGORIES = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
] as const;

export class WechatPayApplymentService {
  private readonly repository: WechatPayApplymentRepositoryPort;
  private readonly configRepository: WechatPayConfigRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly applicationNoFactory: () => string;
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
    this.nowFactory = dependencies.nowFactory ?? (() => new Date().toISOString());
    this.platformActions = new WechatPayApplymentPlatformActions(
      this.repository,
      this.configRepository,
      this.nowFactory,
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

    const created = await this.repository.createApplyment({
      ...this.toTenantApplymentPatch(input),
      tenant_id: tenantId,
      application_no: this.applicationNoFactory(),
      merchant_short_name: input.merchant_short_name,
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

    const updated = await this.repository.updateApplyment({
      id,
      tenantId,
      patch: {
        ...this.toTenantApplymentPatch(input),
        status: "draft",
        applyment_state: "draft",
        rejected_reason: null,
        rejected_at: null,
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "updated",
      fromStatus: current.status,
      toStatus: updated.status,
      message: "租户更新微信支付开通申请资料",
      operatorEmployeeId: employeeId,
    });

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
    const current = await this.getRequiredApplyment({ id, tenantId });
    this.assertEditable(current);
    this.assertSubmitReady(current);
    const now = this.nowFactory();

    const updated = await this.repository.updateApplyment({
      id,
      tenantId,
      patch: {
        status: "submitted",
        applyment_state: "submitted",
        submitted_at: now,
        rejected_at: null,
        rejected_reason: null,
        remark: input.remark ?? current.remark,
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "submitted",
      fromStatus: current.status,
      toStatus: "submitted",
      message: "租户提交微信支付开通申请",
      operatorEmployeeId: employeeId,
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

  async updateWechatStatus(
    authContext: AuthContext,
    id: string,
    input: UpdateWechatPayApplymentWechatStatusInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.updateWechatStatus(authContext, id, input);
  }

  async activateConfig(
    authContext: AuthContext,
    id: string,
    input: ActivateWechatPayApplymentConfigInput,
  ): Promise<ApplymentDetailResult> {
    return this.platformActions.activateConfig(authContext, id, input);
  }

  private async toDetail(
    authContext: AuthContext,
    applyment: WechatPayApplymentRecord | null,
  ): Promise<ApplymentDetailResult> {
    return {
      applyment,
      events: applyment
        ? await this.repository.findEvents({
          tenantId: applyment.tenant_id,
          applymentId: applyment.id,
        })
        : [],
      can_submit: Boolean(applyment) &&
        this.canTenantSubmit(authContext) &&
        ["draft", "rejected"].includes(applyment?.status ?? ""),
    };
  }

  private toTenantApplymentPatch(
    input: CreateWechatPayApplymentInput | UpdateWechatPayApplymentInput,
  ): WechatPayApplymentUpdate {
    const patch: WechatPayApplymentUpdate = {};
    assignIfDefined(patch, "merchant_short_name", input.merchant_short_name);
    assignIfDefined(patch, "license_name", input.license_name);
    assignIfDefined(patch, "license_code", input.license_code);
    assignIfDefined(
      patch,
      "legal_representative_name",
      input.legal_representative_name,
    );
    assignIfDefined(patch, "super_admin_name", input.super_admin_name);
    assignIfDefined(patch, "super_admin_email", input.super_admin_email);
    assignIfDefined(patch, "settlement_account_name", input.settlement_account_name);
    assignIfDefined(patch, "settlement_bank_name", input.settlement_bank_name);
    assignIfDefined(
      patch,
      "settlement_account_summary",
      input.settlement_account_summary,
    );
    assignIfDefined(
      patch,
      "business_scene_description",
      input.business_scene_description,
    );
    assignIfDefined(patch, "contact_address", input.contact_address);
    assignIfDefined(patch, "attachments", input.attachments);
    assignIfDefined(patch, "remark", input.remark);
    if (input.super_admin_phone !== undefined) {
      patch.super_admin_phone_masked = maskPhone(input.super_admin_phone);
    }
    return patch;
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
    if (!["draft", "rejected"].includes(applyment.status)) {
      throw Errors.business(
        409,
        "当前申请状态不能由租户修改",
        "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
        { status: applyment.status },
      );
    }
  }

  private assertSubmitReady(applyment: WechatPayApplymentRecord) {
    const missing = [
      ["merchant_short_name", applyment.merchant_short_name],
      ["license_name", applyment.license_name],
      ["license_code", applyment.license_code],
      ["legal_representative_name", applyment.legal_representative_name],
      ["super_admin_name", applyment.super_admin_name],
      ["super_admin_phone_masked", applyment.super_admin_phone_masked],
      ["settlement_account_name", applyment.settlement_account_name],
      ["settlement_bank_name", applyment.settlement_bank_name],
      ["settlement_account_summary", applyment.settlement_account_summary],
      ["business_scene_description", applyment.business_scene_description],
      ["contact_address", applyment.contact_address],
    ]
      .filter(([, value]) => !String(value ?? "").trim())
      .map(([field]) => field);
    const attachmentCategories = collectAttachmentCategories(applyment.attachments);
    for (const category of REQUIRED_APPLYMENT_ATTACHMENT_CATEGORIES) {
      if (!attachmentCategories.has(category)) {
        missing.push(`attachments.${category}`);
      }
    }
    if (missing.length > 0) {
      throw Errors.business(
        400,
        "微信支付开通申请资料不完整",
        "WECHAT_PAY_APPLYMENT_REQUIRED_FIELDS_MISSING",
        { missing },
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

function assignIfDefined<K extends keyof WechatPayApplymentUpdate>(
  target: WechatPayApplymentUpdate,
  key: K,
  value: WechatPayApplymentUpdate[K] | undefined,
) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function maskPhone(phone: string | null | undefined) {
  const normalized = phone?.trim() ?? "";
  if (normalized.length < 7) return normalized || null;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function collectAttachmentCategories(attachments: unknown) {
  const categories = new Set<string>();
  if (!Array.isArray(attachments)) return categories;

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      continue;
    }
    const category = (attachment as { category?: unknown }).category;
    const parsed = WechatPayApplymentAttachmentCategorySchema.safeParse(category);
    if (parsed.success) {
      categories.add(parsed.data);
    }
  }

  return categories;
}

function resolveMainStatus(
  currentStatus: string,
  input: UpdateWechatPayApplymentWechatStatusInput,
) {
  const applymentState = input.applyment_state;
  const appidBindingState = input.appid_binding_state;
  if (applymentState === "opened" && appidBindingState === "bound") {
    return "bound";
  }
  if (applymentState === "opened") return "opened";
  if (
    applymentState === "reviewing" ||
    applymentState === "account_verifying" ||
    applymentState === "signing"
  ) {
    return applymentState;
  }
  if (applymentState === "rejected") return "rejected";
  return currentStatus === "approved" ? "applying" : currentStatus;
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
