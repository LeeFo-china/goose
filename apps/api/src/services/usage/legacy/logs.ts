import { normalizeDateRange } from "./date-range";
import {
  accessPolicyService,
  aiCallLogRepository,
  assertPlatformAdmin,
  smsSendLogRepository,
  socialVideoTranscriptionRepository,
  type AuthContext,
  type UsageAiLogsQuery,
  type UsageSmsLogsQuery,
  type UsageSocialVideoLogsQuery,
} from "./shared";

export async function listTenantAiLogs(query: UsageAiLogsQuery, authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const range = normalizeDateRange(query);
  return aiCallLogRepository.list({
    tenantId,
    page: query.page,
    pageSize: query.pageSize,
    sceneCode: query.scene_code,
    status: query.status,
    providerCode: query.provider_code,
    modelCode: query.model_code,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}

export async function listTenantSmsLogs(query: UsageSmsLogsQuery, authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const range = normalizeDateRange(query);
  return smsSendLogRepository.list({
    tenantId,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    provider: query.provider,
    purpose: query.purpose,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}

export async function listTenantSocialVideoLogs(
  query: UsageSocialVideoLogsQuery,
  authContext: AuthContext,
) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const range = normalizeDateRange(query);
  return socialVideoTranscriptionRepository.listUsageLogs({
    tenantId,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    provider: query.provider,
    billable: query.billable,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}

export async function listPlatformAiLogs(query: UsageAiLogsQuery, authContext: AuthContext) {
  assertPlatformAdmin(authContext);
  const range = normalizeDateRange(query);
  return aiCallLogRepository.list({
    tenantId: query.tenant_id,
    page: query.page,
    pageSize: query.pageSize,
    sceneCode: query.scene_code,
    status: query.status,
    providerCode: query.provider_code,
    modelCode: query.model_code,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}

export async function listPlatformSmsLogs(query: UsageSmsLogsQuery, authContext: AuthContext) {
  assertPlatformAdmin(authContext);
  const range = normalizeDateRange(query);
  return smsSendLogRepository.list({
    tenantId: query.tenant_id,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    provider: query.provider,
    purpose: query.purpose,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}

export async function listPlatformSocialVideoLogs(
  query: UsageSocialVideoLogsQuery,
  authContext: AuthContext,
) {
  assertPlatformAdmin(authContext);
  const range = normalizeDateRange(query);
  return socialVideoTranscriptionRepository.listUsageLogs({
    tenantId: query.tenant_id,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    provider: query.provider,
    billable: query.billable,
    createdFrom: range.createdFrom,
    createdTo: range.createdTo,
  });
}
