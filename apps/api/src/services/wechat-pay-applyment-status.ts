import { isDeepStrictEqual } from "node:util";

import { Errors } from "@/errors/error-factory";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentEventInsert,
  type WechatPayApplymentRecord,
  type WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { sanitizeApplymentRecord } from "@/services/wechat-pay-applyment-draft";
import {
  wechatPayApplymentGateway,
  type WechatPayApplymentGatewayPort,
  type WechatPayApplymentQueryResult,
  type WechatPayApplymentState,
} from "@/services/wechat-pay-applyment-gateway";
import {
  loadApplymentRuntimeProfile,
  type ApplymentSecretBundleServicePort,
} from "@/services/wechat-pay-applyment-submission-support";
import type {
  AccessPolicyPort,
  ApplymentDetailResult,
  PlatformPaymentConfigRepositoryPort,
  WechatPayApplymentAvailableAction,
  WechatPayApplymentStatusPort,
  WechatPayApplymentStatusRepositoryPort,
} from "@/services/wechat-pay-applyments-types";
import {
  PLATFORM_REPAIR_PERMISSION,
  PLATFORM_SUBMIT_PERMISSION,
  PLATFORM_SYNC_PERMISSION,
} from "@/services/wechat-pay-applyments-types";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";

type StatusGatewayPort = Pick<
  WechatPayApplymentGatewayPort,
  "queryByBusinessCode"
>;
type StatusAccessPolicyPort = Pick<AccessPolicyPort, "hasPermission">;

type StatusServiceDependencies = {
  repository?: WechatPayApplymentStatusRepositoryPort;
  platformPaymentConfigRepository?: PlatformPaymentConfigRepositoryPort;
  accessPolicyService?: StatusAccessPolicyPort;
  secretBundleService?: ApplymentSecretBundleServicePort;
  gateway?: StatusGatewayPort;
  nowFactory?: () => string;
};

type MapWechatApplymentStateInput = {
  applyment_state: WechatPayApplymentState;
  sign_url?: string | null;
  sub_mchid?: string | null;
};

const STATE_MAPPING: Record<
  WechatPayApplymentState,
  { status: string; applyment_state: string }
> = {
  APPLYMENT_STATE_EDITTING: {
    status: "wechat_editing",
    applyment_state: "submitted",
  },
  APPLYMENT_STATE_AUDITING: {
    status: "reviewing",
    applyment_state: "reviewing",
  },
  APPLYMENT_STATE_REJECTED: {
    status: "rejected",
    applyment_state: "rejected",
  },
  APPLYMENT_STATE_TO_BE_CONFIRMED: {
    status: "account_verifying",
    applyment_state: "account_verifying",
  },
  APPLYMENT_STATE_TO_BE_SIGNED: {
    status: "signing",
    applyment_state: "signing",
  },
  APPLYMENT_STATE_SIGNING: {
    status: "opening",
    applyment_state: "signing",
  },
  APPLYMENT_STATE_FINISHED: {
    status: "opened",
    applyment_state: "opened",
  },
  APPLYMENT_STATE_CANCELED: {
    status: "closed",
    applyment_state: "closed",
  },
};

const SIGN_URL_ACTION_STATES = new Set<string>([
  "APPLYMENT_STATE_AUDITING",
  "APPLYMENT_STATE_REJECTED",
  "APPLYMENT_STATE_TO_BE_CONFIRMED",
  "APPLYMENT_STATE_TO_BE_SIGNED",
]);

export const WECHAT_PAY_APPLYMENT_REPAIRABLE_STATUSES = new Set([
  "approved",
  "applying",
  "reviewing",
  "account_verifying",
  "signing",
  "opened",
  "bound",
  "active",
  "suspended",
]);

export const WECHAT_PAY_APPLYMENT_ACTIVATABLE_STATUSES = new Set([
  "opened",
  "bound",
]);

const WECHAT_PAY_APPLYMENT_SYNCABLE_STATUSES = new Set([
  "applying",
  "wechat_editing",
  "reviewing",
  "account_verifying",
  "signing",
  "opening",
  "opened",
  "bound",
]);

export function mapWechatApplymentState(
  input: MapWechatApplymentStateInput,
) {
  const mapped = STATE_MAPPING[input.applyment_state];
  const actions = ["sync_wechat_status"];
  if (
    SIGN_URL_ACTION_STATES.has(input.applyment_state) &&
    hasText(input.sign_url)
  ) actions.push("open_sign_url");
  if (
    input.applyment_state === "APPLYMENT_STATE_FINISHED" &&
    hasText(input.sub_mchid)
  ) actions.push("activate_payment_config");
  return { ...mapped, actions };
}

export function buildWechatApplymentOfficialStatePatch(input: {
  current: WechatPayApplymentRecord;
  result: WechatPayApplymentQueryResult;
  employeeId: string;
  now: string;
  fallbackRequestId?: string | null;
}): WechatPayApplymentUpdate {
  const mapped = mapWechatApplymentState({
    applyment_state: input.result.applymentState,
    sign_url: input.result.signUrl,
    sub_mchid: input.result.subMchid,
  });
  const isFinished = input.result.applymentState === "APPLYMENT_STATE_FINISHED";
  const isRejected = input.result.applymentState === "APPLYMENT_STATE_REJECTED";
  return {
    status: mapped.status,
    applyment_business_code: input.result.businessCode,
    applyment_id: input.result.applymentId,
    applyment_state: mapped.applyment_state,
    applyment_state_message: input.result.applymentStateMessage,
    wechat_applyment_state_raw: input.result.applymentState,
    sign_url: input.result.signUrl,
    audit_detail: input.result.auditDetail.map((detail) => ({
      field: detail.field,
      field_name: detail.fieldName,
      reject_reason: detail.rejectReason,
    })),
    last_wechat_request_id: input.result.requestId ??
      input.fallbackRequestId ?? input.current.last_wechat_request_id,
    last_wechat_synced_at: input.now,
    sub_mchid: input.result.subMchid ?? input.current.sub_mchid,
    sub_appid: null,
    appid_binding_state: isFinished ? "bound" : input.current.appid_binding_state,
    appid_binding_message: isFinished
      ? "使用平台统一小程序 AppID"
      : input.current.appid_binding_message,
    submission_claimed_at: null,
    opened_at: isFinished ? input.current.opened_at ?? input.now : input.current.opened_at,
    rejected_at: isRejected ? input.now : null,
    rejected_reason: isRejected ? input.result.applymentStateMessage : null,
    updated_by_employee_id: input.employeeId,
  };
}

export function getWechatPayApplymentAvailableActions(input: {
  authContext: AuthContext;
  applyment: WechatPayApplymentRecord;
  accessPolicyService: StatusAccessPolicyPort;
}): WechatPayApplymentAvailableAction[] {
  if (!input.authContext.isPlatformAdmin) return [];
  const actions: WechatPayApplymentAvailableAction[] = [];
  if (input.applyment.status === "submitted") {
    actions.push(action("approve", "审核通过"), action("reject", "驳回"));
  }
  if (
    ["approved", "wechat_editing"].includes(input.applyment.status) &&
    hasPermission(input, PLATFORM_SUBMIT_PERMISSION)
  ) actions.push(action("submit_to_wechat", "提交微信审核"));
  if (
    hasText(input.applyment.applyment_business_code) &&
    isWechatStatusSyncAllowed(input.applyment) &&
    hasPermission(input, PLATFORM_SYNC_PERMISSION)
  ) actions.push(action("sync_wechat_status", "同步微信状态"));
  if (
    SIGN_URL_ACTION_STATES.has(
      input.applyment.wechat_applyment_state_raw ?? "",
    ) &&
    hasText(input.applyment.sign_url)
  ) {
    actions.push({
      ...action("open_sign_url", "打开签约链接"),
      url: input.applyment.sign_url,
    });
  }
  if (
    input.applyment.wechat_applyment_state_raw === "APPLYMENT_STATE_FINISHED" &&
    hasText(input.applyment.sub_mchid) &&
    !input.applyment.sub_appid &&
    WECHAT_PAY_APPLYMENT_ACTIVATABLE_STATUSES.has(input.applyment.status)
  ) actions.push(action("activate_payment_config", "激活租户收款"));
  if (
    WECHAT_PAY_APPLYMENT_REPAIRABLE_STATUSES.has(input.applyment.status) &&
    hasPermission(input, PLATFORM_REPAIR_PERMISSION)
  ) {
    actions.push(action("repair_wechat_state", "修复微信状态"));
  }
  return actions;
}

export class WechatPayApplymentStatusService
  implements WechatPayApplymentStatusPort {
  private readonly repository: WechatPayApplymentStatusRepositoryPort;
  private readonly platformPaymentConfigRepository:
    PlatformPaymentConfigRepositoryPort;
  private readonly accessPolicyService: StatusAccessPolicyPort;
  private readonly secretBundleService: ApplymentSecretBundleServicePort;
  private readonly gateway: StatusGatewayPort;
  private readonly nowFactory: () => string;

  constructor(dependencies: StatusServiceDependencies = {}) {
    this.repository = dependencies.repository ?? wechatPayApplymentRepository;
    this.platformPaymentConfigRepository =
      dependencies.platformPaymentConfigRepository ??
        platformPaymentConfigRepository;
    this.accessPolicyService = dependencies.accessPolicyService ??
      accessPolicyService;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.gateway = dependencies.gateway ?? wechatPayApplymentGateway;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date().toISOString());
  }

  async syncWechatStatus(
    authContext: AuthContext,
    applymentId: string,
  ): Promise<ApplymentDetailResult> {
    this.assertPermission(authContext);
    const employeeId = this.requireEmployee(authContext);
    const current = await this.getRequiredApplyment(applymentId);
    if (!isWechatStatusSyncAllowed(current)) {
      throw Errors.business(
        409,
        "当前申请状态不能同步微信进件状态",
        "WECHAT_PAY_APPLYMENT_SYNC_NOT_ALLOWED",
        { status: current.status },
      );
    }
    if (!hasText(current.applyment_business_code)) {
      throw Errors.business(
        409,
        "微信支付正式进件业务编号缺失",
        "WECHAT_PAY_APPLYMENT_BUSINESS_CODE_REQUIRED",
      );
    }
    const runtime = await loadApplymentRuntimeProfile({
      repository: this.platformPaymentConfigRepository,
      secretBundleService: this.secretBundleService,
    });
    const result = await this.gateway.queryByBusinessCode({
      profile: runtime.gatewayProfile,
      businessCode: current.applyment_business_code,
    });
    const now = this.nowFactory();
    const patch = buildWechatApplymentOfficialStatePatch({
      current,
      result,
      employeeId,
      now,
    });
    const changed = hasEffectiveStateChanged(current, patch);
    const updated = await this.repository.updateApplyment({
      id: current.id,
      expectedStatus: current.status,
      expectedUpdatedAt: current.updated_at,
      patch,
    });
    if (changed) await this.recordStatusEvent(current, updated, result, employeeId);
    return this.toDetail(authContext, updated);
  }

  private async getRequiredApplyment(id: string) {
    const applyment = await this.repository.findById({ id });
    if (!applyment) {
      throw Errors.business(
        404,
        "微信支付开通申请不存在",
        "WECHAT_PAY_APPLYMENT_NOT_FOUND",
      );
    }
    return applyment;
  }

  private async recordStatusEvent(
    current: WechatPayApplymentRecord,
    updated: WechatPayApplymentRecord,
    result: WechatPayApplymentQueryResult,
    employeeId: string,
  ) {
    await this.repository.insertEvent({
      tenant_id: updated.tenant_id,
      applyment_id: updated.id,
      event_type: "wechat_status_synced",
      from_status: current.status,
      to_status: updated.status,
      message: result.applymentStateMessage,
      operator_employee_id: employeeId,
      metadata: {
        business_code: result.businessCode,
        applyment_id: result.applymentId,
        wechat_state: result.applymentState,
        request_id: result.requestId,
      } as WechatPayApplymentEventInsert["metadata"],
    });
  }

  private async toDetail(
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

  private assertPermission(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      !this.accessPolicyService.hasPermission(
        authContext,
        PLATFORM_SYNC_PERMISSION,
      )
    ) throw Errors.forbidden();
  }

  private requireEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) throw Errors.forbidden();
    return authContext.employeeId;
  }
}

function hasEffectiveStateChanged(
  current: WechatPayApplymentRecord,
  patch: WechatPayApplymentUpdate,
) {
  return !isDeepStrictEqual({
    status: current.status,
    applyment_state: current.applyment_state,
    applyment_state_message: current.applyment_state_message,
    wechat_applyment_state_raw: current.wechat_applyment_state_raw,
    sign_url: current.sign_url,
    audit_detail: current.audit_detail,
    sub_mchid: current.sub_mchid,
    sub_appid: current.sub_appid,
    appid_binding_state: current.appid_binding_state,
    appid_binding_message: current.appid_binding_message,
  }, {
    status: patch.status,
    applyment_state: patch.applyment_state,
    applyment_state_message: patch.applyment_state_message,
    wechat_applyment_state_raw: patch.wechat_applyment_state_raw,
    sign_url: patch.sign_url,
    audit_detail: patch.audit_detail,
    sub_mchid: patch.sub_mchid,
    sub_appid: patch.sub_appid,
    appid_binding_state: patch.appid_binding_state,
    appid_binding_message: patch.appid_binding_message,
  });
}

function action(key: string, label: string): WechatPayApplymentAvailableAction {
  return { key, label };
}

function hasPermission(
  input: Parameters<typeof getWechatPayApplymentAvailableActions>[0],
  permission: string,
) {
  return input.accessPolicyService.hasPermission(input.authContext, permission);
}

function isWechatStatusSyncAllowed(applyment: WechatPayApplymentRecord) {
  if (WECHAT_PAY_APPLYMENT_SYNCABLE_STATUSES.has(applyment.status)) return true;
  return applyment.status === "rejected" &&
    applyment.wechat_applyment_state_raw === "APPLYMENT_STATE_REJECTED";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const wechatPayApplymentStatusService =
  new WechatPayApplymentStatusService();
