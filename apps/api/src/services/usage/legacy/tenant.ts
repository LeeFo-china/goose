import { buildDateBuckets, getCreatedDate, normalizeDateRange } from "./date-range";
import { summarizeAi, summarizeSms, summarizeSocialVideo, incrementCounter } from "./summaries";
import {
  ACTIVE_PROJECT_STATUSES,
  accessPolicyService,
  aiCallLogRepository,
  smsSendLogRepository,
  socialVideoTranscriptionRepository,
  usageRepository,
  type AuthContext,
  type UsageDateRangeQuery,
} from "./shared";

export async function getTenantSummary(query: UsageDateRangeQuery, authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const range = normalizeDateRange(query);
  const [aiRows, smsRows, socialVideoRows] = await Promise.all([
    aiCallLogRepository.listUsageStatsRows({
      tenantId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
    smsSendLogRepository.listUsageRows({
      tenantId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
    socialVideoTranscriptionRepository.listUsageStatsRows({
      tenantId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
  ]);

  return {
    range: {
      date_from: range.dateFrom,
      date_to: range.dateTo,
    },
    tenant: {
      id: tenantId,
      name: authContext.tenantName,
      slug: authContext.tenantSlug,
    },
    ai: summarizeAi(aiRows),
    sms: summarizeSms(smsRows),
    social_video: summarizeSocialVideo(socialVideoRows),
  };
}

export async function getTenantOverview(query: UsageDateRangeQuery, authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const range = normalizeDateRange(query);
  const dates = buildDateBuckets(range);
  const dateSet = new Set(dates);
  const trendMap = new Map(dates.map((date) => [date, {
    date,
    new_customers: 0,
    new_projects: 0,
    ai_tokens: 0,
    ai_calls: 0,
    ai_failures: 0,
    social_video_minutes: 0,
    social_video_tasks: 0,
    social_video_failures: 0,
  }]));

  const [customerRows, projectRows, expenseRows, aiRows, socialVideoRows] = await Promise.all([
    usageRepository.listCustomerStatsRows({
      tenantId,
      createdTo: range.createdTo,
    }),
    usageRepository.listProjectStatsRows({
      tenantId,
      createdTo: range.createdTo,
    }),
    usageRepository.listExpenseStatsRows({
      tenantId,
      createdTo: range.createdTo,
    }),
    aiCallLogRepository.listUsageStatsRows({
      tenantId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
    socialVideoTranscriptionRepository.listUsageStatsRows({
      tenantId,
      createdFrom: range.createdFrom,
      createdTo: range.createdTo,
    }),
  ]);

  for (const row of customerRows) {
    const date = getCreatedDate(row.created_at);
    if (!date || !dateSet.has(date)) continue;
    const bucket = trendMap.get(date);
    if (bucket) bucket.new_customers += 1;
  }

  for (const row of projectRows) {
    const date = getCreatedDate(row.created_at);
    if (!date || !dateSet.has(date)) continue;
    const bucket = trendMap.get(date);
    if (bucket) bucket.new_projects += 1;
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
  const projectStatusCounts: Record<string, number> = {};
  for (const row of projectRows) {
    incrementCounter(projectStatusCounts, row.status);
  }
  const pendingExpenseRows = expenseRows.filter((row) => row.status === "pending");
  const pendingExpenseAmount = pendingExpenseRows.reduce((total, row) => {
    const amount = Number(row.total_amount || 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return {
    range: {
      date_from: range.dateFrom,
      date_to: range.dateTo,
    },
    tenant: {
      id: tenantId,
      name: authContext.tenantName,
      slug: authContext.tenantSlug,
    },
    summary: {
      total_customers: customerRows.length,
      new_customers: Array.from(trendMap.values()).reduce(
        (total, item) => total + item.new_customers,
        0,
      ),
      total_projects: projectRows.length,
      active_projects: projectRows.filter((row) => ACTIVE_PROJECT_STATUSES.has(row.status || "")).length,
      pending_expense_count: pendingExpenseRows.length,
      pending_expense_amount: Number(pendingExpenseAmount.toFixed(2)),
      ai_tokens: aiSummary.total_tokens,
      ai_calls: aiSummary.call_count,
      ai_failures: aiSummary.failure_count,
      social_video_minutes: socialVideoSummary.billable_minutes,
      social_video_tasks: socialVideoSummary.transcription_count,
      social_video_failures: socialVideoSummary.failure_count,
    },
    project_status_counts: projectStatusCounts,
    trend: Array.from(trendMap.values()),
  };
}
