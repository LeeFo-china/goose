import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentRecord,
} from "@/repositories/wechat-pay-applyments";
import type {
  ApproveWechatPayApplymentInput,
  MarkWechatPayApplymentApplyingInput,
  PlatformWechatPayApplymentListQuery,
  RepairWechatPayApplymentStateInput,
  RejectWechatPayApplymentInput,
} from "@/schema/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import { getWechatPayApplymentAvailableActions } from "@/services/wechat-pay-applyment-status";
import type {
  AccessPolicyPort,
  ApplymentDetailResult,
  PlatformPaymentConfigRepositoryPort,
  WechatPayApplymentRepositoryPort,
  WechatPayApplymentStatusPort,
  WechatPayConfigRepositoryPort,
  WechatPayApplymentSubmissionPort,
} from "@/services/wechat-pay-applyments-types";
import { PLATFORM_REPAIR_PERMISSION } from "@/services/wechat-pay-applyments-types";
import {
  evaluatePlatformPaymentProfileReadiness,
  PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE,
} from "@/services/platform-payment-readiness";

export class WechatPayApplymentPlatformActions {
  constructor(
    private readonly repository: WechatPayApplymentRepositoryPort,
    private readonly configRepository: WechatPayConfigRepositoryPort,
    private readonly platformPaymentConfigRepository:
      PlatformPaymentConfigRepositoryPort,
    private readonly nowFactory: () => string,
    private readonly submissionService: WechatPayApplymentSubmissionPort,
    private readonly statusService: WechatPayApplymentStatusPort,
    private readonly accessPolicyService: Pick<AccessPolicyPort, "hasPermission">,
  ) {}

  async submitToWechat(authContext: AuthContext, id: string) {
    return this.submissionService.submitToWechat(authContext, id);
  }

  async listForPlatform(
    authContext: AuthContext,
    query: PlatformWechatPayApplymentListQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listApplyments({ query });
  }

  async getPlatformDetail(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    this.assertPlatformAdmin(authContext);
    const applyment = await this.getRequiredApplyment({ id });
    return this.toPlatformDetail(authContext, applyment);
  }

  async approve(
    authContext: AuthContext,
    id: string,
    input: ApproveWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    this.assertPlatformAdmin(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id });
    this.assertStatus(current, ["submitted"], "当前申请不是待审核状态");
    const updated = await this.repository.updateApplyment({
      id,
      patch: {
        status: "approved",
        approved_at: this.nowFactory(),
        reviewed_by_employee_id: employeeId,
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "approved",
      fromStatus: current.status,
      toStatus: "approved",
      message: input.message ?? "平台审核通过微信支付开通申请",
      operatorEmployeeId: employeeId,
    });
    return this.toPlatformDetail(authContext, updated);
  }

  async reject(
    authContext: AuthContext,
    id: string,
    input: RejectWechatPayApplymentInput,
  ): Promise<ApplymentDetailResult> {
    this.assertPlatformAdmin(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id });
    this.assertStatus(
      current,
      ["submitted", "approved", "applying", "reviewing", "account_verifying", "signing"],
      "当前申请不能驳回",
    );
    const updated = await this.repository.updateApplyment({
      id,
      patch: {
        status: "rejected",
        applyment_state: "rejected",
        rejected_at: this.nowFactory(),
        rejected_reason: input.reason,
        reviewed_by_employee_id: employeeId,
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "rejected",
      fromStatus: current.status,
      toStatus: "rejected",
      message: input.reason,
      operatorEmployeeId: employeeId,
    });
    return this.toPlatformDetail(authContext, updated);
  }

  async markApplying(
    authContext: AuthContext,
    id: string,
    input: MarkWechatPayApplymentApplyingInput,
  ): Promise<ApplymentDetailResult> {
    this.assertPlatformAdmin(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id });
    this.assertStatus(current, ["approved"], "当前申请未审核通过");
    const updated = await this.repository.updateApplyment({
      id,
      patch: {
        status: "applying",
        applyment_business_code:
          input.applyment_business_code ?? current.applyment_business_code,
        applyment_state: "submitted",
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "applying",
      fromStatus: current.status,
      toStatus: "applying",
      message: input.message ?? "平台已开始人工进件",
      operatorEmployeeId: employeeId,
    });
    return this.toPlatformDetail(authContext, updated);
  }

  async syncWechatStatus(authContext: AuthContext, id: string) {
    return this.statusService.syncWechatStatus(authContext, id);
  }

  async repairWechatState(
    authContext: AuthContext,
    id: string,
    input: RepairWechatPayApplymentStateInput,
  ): Promise<ApplymentDetailResult> {
    this.assertRepairPermission(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id });
    this.assertStatus(
      current,
      [
        "approved",
        "applying",
        "reviewing",
        "account_verifying",
        "signing",
        "opened",
        "bound",
        "active",
        "suspended",
      ],
      "当前申请不能回填微信进件状态",
    );
    const nextStatus = resolveMainStatus(current.status, input);
    const now = this.nowFactory();
    const updated = await this.repository.updateApplyment({
      id,
      patch: {
        applyment_business_code: input.applyment_business_code ??
          current.applyment_business_code,
        applyment_id: input.applyment_id ?? current.applyment_id,
        applyment_state: input.applyment_state ?? current.applyment_state,
        applyment_state_message: input.applyment_state_message ??
          current.applyment_state_message,
        sub_mchid: input.sub_mchid ?? current.sub_mchid,
        sub_appid: input.sub_appid ?? current.sub_appid,
        appid_binding_state: input.appid_binding_state ??
          current.appid_binding_state,
        appid_binding_message: input.appid_binding_message ??
          current.appid_binding_message,
        status: nextStatus,
        opened_at: nextStatus === "opened" || nextStatus === "bound"
          ? current.opened_at ?? now
          : current.opened_at,
        updated_by_employee_id: employeeId,
      },
    });
    await this.syncPaymentConfigStatus({
      current,
      nextStatus,
      employeeId,
      now,
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "wechat_state_repaired",
      fromStatus: current.status,
      toStatus: nextStatus,
      message: input.reason,
      operatorEmployeeId: employeeId,
      metadata: {
        reason: input.reason,
        before: repairStateSnapshot(current),
        after: repairStateSnapshot(updated),
      },
    });
    return this.toPlatformDetail(authContext, updated);
  }

  async activateConfig(
    authContext: AuthContext,
    id: string,
  ): Promise<ApplymentDetailResult> {
    this.assertPlatformAdmin(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment({ id });
    this.assertActivatable(current);
    const platformConfig = await this.getReadyServiceProviderProfile();
    const now = this.nowFactory();
    const config = await this.configRepository.upsertWechatPayConfig({
      tenant_id: current.tenant_id,
      provider: "wechat_pay",
      principal_type: "tenant",
      merchant_mode: "service_provider_sub_merchant",
      merchant_name: current.merchant_short_name,
      merchant_id: platformConfig.merchant_id ?? "",
      sub_merchant_id: current.sub_mchid,
      app_id: platformConfig.app_id ?? "",
      sub_app_id: null,
      applyment_business_code: current.applyment_business_code,
      applyment_id: current.applyment_id,
      applyment_state: "opened",
      applyment_state_message: current.applyment_state_message,
      appid_binding_state: "bound",
      appid_binding_message: current.appid_binding_message,
      opened_at: current.opened_at ?? now,
      status: "active",
      enabled_channels: platformConfig.enabled_channels,
      settlement_account_summary: current.settlement_account_summary,
      encrypted_config_ref: platformConfig.encrypted_config_ref ?? "",
      risk_switches: {},
      serial_no: platformConfig.serial_no ?? "",
      notify_url: platformConfig.notify_url ?? "",
      validation_status: platformConfig.validation_status,
      last_validated_at: platformConfig.last_validated_at,
      platform_payment_config_id: platformConfig.id,
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    });
    const updated = await this.repository.updateApplyment({
      id,
      patch: {
        status: "active",
        payment_config_id: config.id,
        activated_at: now,
        sensitive_payload_ciphertext: null,
        sensitive_payload_version: null,
        sensitive_payload_updated_at: null,
        has_sensitive_payload: false,
        updated_by_employee_id: employeeId,
      },
    });
    await this.recordEvent({
      applyment: updated,
      eventType: "config_activated",
      fromStatus: current.status,
      toStatus: "active",
      message: "平台激活租户微信支付配置",
      operatorEmployeeId: employeeId,
      metadata: { payment_config_id: config.id },
    });
    return this.toPlatformDetail(authContext, updated);
  }

  private async getReadyServiceProviderProfile() {
    const definition =
      PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE.tenant_service_provider;
    const config = await this.platformPaymentConfigRepository
      .findWechatPayConfigByProfile(definition.profile_code);
    const readiness = evaluatePlatformPaymentProfileReadiness(
      definition,
      config,
    );
    if (!config || !readiness.ready) {
      throw Errors.business(
        409,
        "平台服务商支付配置尚未就绪",
        "PLATFORM_PAYMENT_PROFILE_NOT_READY",
        {
          profile_code: definition.profile_code,
          blocker_codes: readiness.blockers.map((blocker) => blocker.code),
        },
      );
    }
    return config;
  }

  private async toPlatformDetail(
    authContext: AuthContext,
    applyment: WechatPayApplymentRecord,
  ): Promise<ApplymentDetailResult> {
    return {
      applyment: sanitizeApplymentRecord(applyment),
      events: await this.repository.findEvents({
        tenantId: applyment.tenant_id,
        applymentId: applyment.id,
      }),
      can_submit: false,
      available_actions: getWechatPayApplymentAvailableActions({
        authContext,
        applyment,
        accessPolicyService: this.accessPolicyService,
      }),
    };
  }

  private async getRequiredApplyment(input: { id: string }) {
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

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
  }

  private assertRepairPermission(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      !this.accessPolicyService.hasPermission(
        authContext,
        PLATFORM_REPAIR_PERMISSION,
      )
    ) throw Errors.forbidden();
  }

  private requireEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) throw Errors.forbidden();
    return authContext.employeeId;
  }

  private assertStatus(
    applyment: WechatPayApplymentRecord,
    allowed: string[],
    message: string,
  ) {
    if (allowed.includes(applyment.status)) return;
    throw Errors.business(
      409,
      message,
      "WECHAT_PAY_APPLYMENT_STATUS_INVALID",
      { status: applyment.status, allowed },
    );
  }

  private assertActivatable(
    applyment: WechatPayApplymentRecord,
  ): asserts applyment is WechatPayApplymentRecord & {
    sub_mchid: string;
  } {
    if (
      applyment.wechat_applyment_state_raw === "APPLYMENT_STATE_FINISHED" &&
      applyment.applyment_state === "opened" &&
      applyment.sub_mchid &&
      !applyment.sub_appid &&
      applyment.appid_binding_state === "bound"
    ) {
      return;
    }
    throw Errors.business(
      409,
      "租户微信支付进件未开通或 AppID 未绑定",
      "WECHAT_PAY_APPLYMENT_NOT_ACTIVATABLE",
      {
        applyment_state: applyment.applyment_state,
        wechat_applyment_state_raw: applyment.wechat_applyment_state_raw,
        appid_binding_state: applyment.appid_binding_state,
        has_sub_mchid: Boolean(applyment.sub_mchid),
        uses_platform_appid: !applyment.sub_appid,
      },
    );
  }

  private async syncPaymentConfigStatus(input: {
    current: WechatPayApplymentRecord;
    nextStatus: string;
    employeeId: string;
    now: string;
  }) {
    if (!input.current.payment_config_id) return;
    if (input.nextStatus !== "closed" && input.nextStatus !== "suspended") return;

    await this.configRepository.updateWechatPayConfig({
      id: input.current.payment_config_id,
      patch: {
        status: input.nextStatus === "closed" ? "disabled" : "suspended",
        disabled_at: input.nextStatus === "closed" ? input.now : null,
        suspended_at: input.nextStatus === "suspended" ? input.now : null,
        updated_by_employee_id: input.employeeId,
      },
    });
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

function resolveMainStatus(
  currentStatus: string,
  input: RepairWechatPayApplymentStateInput,
) {
  const applymentState = input.applyment_state;
  if (applymentState === "closed") return "closed";
  if (applymentState === "suspended") return "suspended";
  if (applymentState === "opened" && input.appid_binding_state === "bound") {
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

function repairStateSnapshot(applyment: WechatPayApplymentRecord) {
  return {
    status: applyment.status,
    applyment_business_code: applyment.applyment_business_code,
    applyment_id: applyment.applyment_id,
    applyment_state: applyment.applyment_state,
    applyment_state_message: applyment.applyment_state_message,
    sub_mchid: applyment.sub_mchid,
    sub_appid: applyment.sub_appid,
    appid_binding_state: applyment.appid_binding_state,
    appid_binding_message: applyment.appid_binding_message,
  };
}
