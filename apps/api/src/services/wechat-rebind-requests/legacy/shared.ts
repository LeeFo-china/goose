export { ErrorCodes } from "@/errors/error-codes";
export { Errors } from "@/errors/error-factory";
export {
  wechatRebindRequestRepository,
  type WechatRebindRequestRecord,
  type WechatTargetIdentityRecord,
} from "@/repositories/wechat-rebind-requests";
export type {
  ReviewWechatRebindRequestInput,
  WechatRebindRequestInput,
  WechatRebindRequestListQuery,
} from "@/schema/wechat";
export { accessPolicyService } from "@/services/access-policy";
export type { AuthContext } from "@/services/authorization";
export { authorizationService } from "@/services/authorization";
export { platformAuditLogService } from "@/services/platform-audit-logs";
export { userIdentityService } from "@/services/user-identities";
export { wechatCustomerIdentityService } from "@/services/wechat-customer-identities";
export { SupabaseDB } from "@/utils/supabase";
export { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
export { isEmployeeOperableStatus } from "@gooes/domain";
export type { SmsScene, SmsVerificationStatus } from "@gooes/domain";
import type { SmsScene, SmsVerificationStatus } from "@gooes/domain";

export type SmsVerificationCodeRow = {
  id: string;
  phone: string;
  scene: SmsScene;
  code: string;
  status: SmsVerificationStatus;
  expired_at: string;
};

export type JwtUserLike = {
  sub?: string | null;
  openid?: string | null;
  tenant_id?: string | null;
  customer_id?: string | null;
  employee_id?: string | null;
};

export function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

export function normalizeNullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}
