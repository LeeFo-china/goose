import { buildDateBuckets, getCreatedDate, normalizeDateRange } from "./date-range";
import { summarizeAi, summarizeSms, summarizeSocialVideo } from "./summaries";
import {
  aiCallLogRepository,
  assertPlatformUsagePermission,
  smsSendLogRepository,
  socialVideoTranscriptionRepository,
  usageRepository,
  type AuthContext,
  type PlatformTenantUsageQuery,
  type UsageDateRangeQuery,
} from "./shared";

const PLATFORM_USAGE_READ_PERMISSION = "platform.usage.read";

export async function listPlatformTenantUsage(
  query: PlatformTenantUsageQuery,
  authContext: AuthContext,
) {
  assertPlatformUsagePermission(authContext, PLATFORM_USAGE_READ_PERMISSION);
  const range = normalizeDateRange(query);
  const tenants = await usageRepository.listTenants({
    page: query.page,
    pageSize: query.pageSize,
    tenantId: query.tenant_id,
    keyword: query.keyword,
  });
  const tenantIds = tenants.list.map((tenant) => tenant.id);
  const [aiRows, smsRows, socialVideoRows] = tenantIds.length > 0
    ? await Promise.all([
      aiCallLogRepository.listUsageStatsRows({
        tenantId: null,
        tenantIds,
        createdFrom: range.createdFrom,
        createdTo: range.createdTo,
      }),
      smsSendLogRepository.listUsageRows({
        tenantIds,
        createdFrom: range.createdFrom,
        createdTo: range.createdTo,
      }),
      socialVideoTranscriptionRepository.listUsageStatsRows({
        tenantId: null,
        tenantIds,
        createdFrom: range.createdFrom,
        createdTo: range.createdTo,
      }),
    ])
    : [[], [], []] as const;

  return {
    range: {
      date_from: range.dateFrom,
      date_to: range.dateTo,
    },
    list: tenants.list.map((tenant) => ({
      tenant,
      ai: summarizeAi(aiRows.filter((row) => row.tenant_id === tenant.id)),
      sms: summarizeSms(smsRows.filter((row) => row.tenant_id === tenant.id)),
      social_video: summarizeSocialVideo(
        socialVideoRows.filter((row) => row.tenant_id === tenant.id),
      ),
    })),
    pagination: tenants.pagination,
  };
}

export async function getPlatformOverview(query: UsageDateRangeQuery, authContext: AuthContext) {
  assertPlatformUsagePermission(authContext, PLATFORM_USAGE_READ_PERMISSION);
  const range = normalizeDateRange(query);
  const dates = buildDateBuckets(range);
  const dateSet = new Set(dates);
  const trendMap = new Map(dates.map((date) => [date, {
    date,
    new_tenants: 0,
    ai_tokens: 0,
    ai_calls: 0,
    ai_failures: 0,
    social_video_minutes: 0,
    social_video_tasks: 0,
    social_video_failures: 0,
  }]));

  const [tenantRows, aiRows, socialVideoRows] = await Promise.all([
    usageRepository.listTenantStatsRows({ createdTo: range.createdTo }),
    aiCallLogRepository.listUsageStatsRows({
      tenantId: null,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
    socialVideoTranscriptionRepository.listUsageStatsRows({
      tenantId: null,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
  ]);

  for (const row of tenantRows) {
    const date = getCreatedDate(row.created_at);
    if (!date || !dateSet.has(date)) continue;
    const bucket = trendMap.get(date);
    if (bucket) bucket.new_tenants += 1;
  }

  for (const row of aiRows) {
    const date = getCreatedDate(row.created_at);
    if (!date || !dateSet.has(date)) continue;
    const bucket = trendMap.get(date);
    if (!bucket) continue;
    bucket.ai_tokens += row.total_tokens || 0;
    bucket.ai_calls += 1;
    if (row.status === "failure") bucket.ai_failures += 1;
  }

  for (const row of socialVideoRows) {
    const date = getCreatedDate(row.created_at);
    if (!date || !dateSet.has(date)) continue;
    const bucket = trendMap.get(date);
    if (!bucket) continue;
    bucket.social_video_tasks += 1;
    if (row.status === "failed") bucket.social_video_failures += 1;
    if (row.status === "completed" && row.billable !== false) {
      const duration = row.billing_duration_seconds ?? row.audio_duration_seconds;
      const minutes = row.billing_minutes;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
        bucket.social_video_minutes += typeof minutes === "number" && Number.isFinite(minutes)
          ? minutes
          : Math.max(1, Math.ceil(duration / 60));
      }
    }
  }

  const aiSummary = summarizeAi(aiRows);
  const socialVideoSummary = summarizeSocialVideo(socialVideoRows);
  const activeTenantCount = tenantRows.filter((row) => row.status === "active").length;
  const suspendedTenantCount = tenantRows.filter((row) => row.status === "suspended").length;
  const newTenantCount = Array.from(trendMap.values()).reduce(
    (total, item) => total + item.new_tenants,
    0,
  );

  return {
    range: {
      date_from: range.dateFrom,
      date_to: range.dateTo,
    },
    summary: {
      total_tenants: tenantRows.length,
      active_tenants: activeTenantCount,
      suspended_tenants: suspendedTenantCount,
      new_tenants: newTenantCount,
      ai_tokens: aiSummary.total_tokens,
      ai_calls: aiSummary.call_count,
      ai_failures: aiSummary.failure_count,
      social_video_minutes: socialVideoSummary.billable_minutes,
      social_video_tasks: socialVideoSummary.transcription_count,
      social_video_failures: socialVideoSummary.failure_count,
    },
    trend: Array.from(trendMap.values()),
  };
}
