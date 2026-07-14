import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { TenantOnboardingPlatformApplicationRecord } from "@/repositories/tenant-onboarding-types";

export const REVIEW_PERMISSION = "platform.tenant_onboarding.review";
export const MAX_PAGE_SIZE = 100;
export const LICENSE_TTL_SECONDS = 600;
export const MAX_SLUG_ATTEMPTS = 3;
export const REVIEW_RESOURCE_TYPE = "tenant_onboarding_application";

const approvalStatusErrors = {
  application_not_found: [
    404,
    "入驻申请不存在",
    ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND,
  ],
  application_state_conflict: [
    409,
    "申请状态已变化",
    ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
  ],
  application_version_conflict: [
    409,
    "申请已被其他审核人更新",
    ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
  ],
  subject_exists: [
    409,
    "该企业主体已经入驻",
    ErrorCodes.TENANT_ONBOARDING_SUBJECT_EXISTS,
  ],
  admin_phone_exists: [
    409,
    "负责人手机号已属于现有员工",
    ErrorCodes.TENANT_ONBOARDING_PHONE_MEMBER_EXISTS,
  ],
  partner_ambiguous: [
    409,
    "存在多个同级城市合伙人，请明确选择",
    ErrorCodes.TENANT_ONBOARDING_PARTNER_AMBIGUOUS,
  ],
  partner_unavailable: [
    409,
    "城市合伙人状态或区域已变化",
    ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
  ],
} as const;

export function normalizePage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function normalizePageSize(value: number) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_SIZE)
    : 20;
}

export function defaultTenantSlug(
  application: TenantOnboardingPlatformApplicationRecord,
  attempt: number,
) {
  const subject = application.unified_social_credit_code
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(-8);
  const applicationPart = application.id.replaceAll("-", "").slice(0, 8);
  return `zq-${subject}-${applicationPart}-${attempt}`;
}

export function approvedAttribution(
  application: TenantOnboardingPlatformApplicationRecord,
): {
  finalPartnerId: string | null;
  sourceType: "invite_code" | "region_auto_assignment" | "platform_manual" | null;
} {
  const sourceType = application.attribution_source_type;
  if (
    sourceType !== null && sourceType !== "invite_code" &&
    sourceType !== "region_auto_assignment" && sourceType !== "platform_manual"
  ) throw Errors.dbError("已通过申请归因数据无效");
  return {
    finalPartnerId: application.final_partner_id,
    sourceType: sourceType as
      | "invite_code"
      | "region_auto_assignment"
      | "platform_manual"
      | null,
  };
}

export function throwApprovalStatus(
  status: keyof typeof approvalStatusErrors,
): never {
  const [statusCode, message, code] = approvalStatusErrors[status];
  throw Errors.business(statusCode, message, code);
}

export function auditSummary(action: string) {
  const summaries: Record<string, string> = {
    tenant_onboarding_start_review: "开始审核装企入驻申请",
    tenant_onboarding_request_supplement: "要求装企入驻申请补充资料",
    tenant_onboarding_request_partner_assist: "发起装企入驻城市合伙人协查",
    tenant_onboarding_approve: "审核通过装企入驻申请",
    tenant_onboarding_reject: "驳回装企入驻申请",
    tenant_onboarding_notification_retry: "重试装企入驻状态通知",
  };
  return summaries[action] ?? "处理装企入驻申请";
}

export const applicationNotFoundError = () => Errors.business(
  404,
  "入驻申请不存在",
  ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND,
);

export const stateConflictError = () => Errors.business(
  409,
  "申请状态或版本已变化，请刷新后重试",
  ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
);

export const partnerUnavailableError = () => Errors.business(
  409,
  "城市合伙人状态或区域已变化",
  ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
);

export const partnerAmbiguousError = () => Errors.business(
  409,
  "存在多个同级城市合伙人，请明确选择",
  ErrorCodes.TENANT_ONBOARDING_PARTNER_AMBIGUOUS,
);

export const reviewForbiddenError = () => Errors.business(
  403,
  "无装企入驻审核权限",
  ErrorCodes.TENANT_ONBOARDING_REVIEW_FORBIDDEN,
);

export const documentForbiddenError = () => Errors.business(
  403,
  "营业执照文件不可用于当前审核",
  ErrorCodes.TENANT_ONBOARDING_DOCUMENT_FORBIDDEN,
);

export const tenantSlugConflictError = () => Errors.business(
  409,
  "租户标识已被占用，请重试",
  ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT,
);
