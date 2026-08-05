export { Errors } from "@/errors/error-factory";
import { Errors } from "@/errors/error-factory";
export { aiCallLogRepository } from "@/repositories/ai-call-logs";
export { smsSendLogRepository } from "@/repositories/sms-send-logs";
export { socialVideoTranscriptionRepository } from "@/repositories/social-video-transcriptions";
export { usageRepository } from "@/repositories/usage";
export type {
  PlatformTenantUsageQuery,
  UsageAiLogsQuery,
  UsageDateRangeQuery,
  UsageSmsLogsQuery,
  UsageSocialVideoLogsQuery,
} from "@/schema/usage";
import { accessPolicyService } from "@/services/access-policy";
export { accessPolicyService };
export type { AuthContext } from "@/services/authorization";
import type { AuthContext } from "@/services/authorization";
import type { PermissionCode } from "@gooes/domain";

export type DateRange = {
  dateFrom: string;
  dateTo: string;
  createdFrom: string;
  createdTo: string;
};

export const ACTIVE_PROJECT_STATUSES = new Set([
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
  "started",
  "constructing",
  "on_hold",
  "acceptance",
]);

export function assertPlatformUsagePermission(
  authContext: AuthContext,
  permissionCode: PermissionCode,
) {
  const isPlatformIdentity =
    authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
  if (authContext.tenantId !== null || !isPlatformIdentity) {
    throw Errors.forbidden();
  }
  accessPolicyService.assertPermission(authContext, permissionCode);
}
