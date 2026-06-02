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
export { accessPolicyService } from "@/services/access-policy";
export type { AuthContext } from "@/services/authorization";
import type { AuthContext } from "@/services/authorization";

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

export function assertPlatformAdmin(authContext: AuthContext) {
  if (!authContext.isPlatformAdmin) {
    throw Errors.forbidden();
  }
}
