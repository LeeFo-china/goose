import { Errors } from "@/errors/error-factory";
import { aiCallLogRepository } from "@/repositories/ai-call-logs";
import { smsSendLogRepository } from "@/repositories/sms-send-logs";
import { socialVideoTranscriptionRepository } from "@/repositories/social-video-transcriptions";
import { usageRepository } from "@/repositories/usage";
import type {
  PlatformTenantUsageQuery,
  UsageAiLogsQuery,
  UsageDateRangeQuery,
  UsageSmsLogsQuery,
  UsageSocialVideoLogsQuery,
} from "@/schema/usage";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type DateRange = {
  dateFrom: string;
  dateTo: string;
  createdFrom: string;
  createdTo: string;
};

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeDateRange(input: UsageDateRangeQuery): DateRange {
  const fromDate = input.date_from
    ? dateOnlyToUtc(input.date_from)
    : startOfCurrentMonth();
  const toDate = input.date_to
    ? dateOnlyToUtc(input.date_to)
    : new Date();

  const normalizedFrom = toDateOnly(fromDate);
  const normalizedTo = toDateOnly(toDate);
  const createdFrom = dateOnlyToUtc(normalizedFrom).toISOString();
  const createdTo = addDays(dateOnlyToUtc(normalizedTo), 1).toISOString();

  return {
    dateFrom: normalizedFrom,
    dateTo: normalizedTo,
    createdFrom,
    createdTo,
  };
}

function incrementCounter(target: Record<string, number>, key: string | null | undefined, amount = 1) {
  const normalized = key || "unknown";
  target[normalized] = (target[normalized] || 0) + amount;
}

class UsageService {
  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private summarizeAi(rows: Awaited<ReturnType<typeof aiCallLogRepository.listUsageStatsRows>>) {
    const statusCounts: Record<string, number> = {};
    const sceneCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let missingTokenCount = 0;

    for (const row of rows) {
      incrementCounter(statusCounts, row.status);
      incrementCounter(sceneCounts, row.scene_code);
      incrementCounter(providerCounts, row.provider_code);
      incrementCounter(modelCounts, row.model_code);
      if (typeof row.total_tokens !== "number") {
        missingTokenCount += 1;
      }
      promptTokens += row.prompt_tokens || 0;
      completionTokens += row.completion_tokens || 0;
      totalTokens += row.total_tokens || 0;
    }

    return {
      call_count: rows.length,
      success_count: statusCounts.success || 0,
      failure_count: statusCounts.failure || 0,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      missing_token_count: missingTokenCount,
      status_counts: statusCounts,
      scene_counts: sceneCounts,
      provider_counts: providerCounts,
      model_counts: modelCounts,
    };
  }

  private summarizeSms(rows: Awaited<ReturnType<typeof smsSendLogRepository.listUsageRows>>) {
    const statusCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    const channelModeCounts: Record<string, number> = {};
    const purposeCounts: Record<string, number> = {};
    let sendCount = 0;

    for (const row of rows) {
      const smsCount = row.sms_count || 0;
      sendCount += smsCount;
      incrementCounter(statusCounts, row.status, smsCount || 1);
      incrementCounter(providerCounts, row.provider, smsCount || 1);
      incrementCounter(channelModeCounts, row.channel_mode, smsCount || 1);
      incrementCounter(purposeCounts, row.purpose, smsCount || 1);
    }

    return {
      send_count: sendCount,
      success_count: statusCounts.success || 0,
      failure_count: statusCounts.failure || 0,
      mock_count: statusCounts.mock || 0,
      disabled_count: statusCounts.disabled || 0,
      status_counts: statusCounts,
      provider_counts: providerCounts,
      channel_mode_counts: channelModeCounts,
      purpose_counts: purposeCounts,
    };
  }

  private summarizeSocialVideo(rows: Awaited<ReturnType<typeof socialVideoTranscriptionRepository.listUsageStatsRows>>) {
    const statusCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    let billableTranscriptionCount = 0;
    let durationSeconds = 0;
    let billableMinutes = 0;
    let missingDurationCount = 0;

    for (const row of rows) {
      incrementCounter(statusCounts, row.status);
      incrementCounter(providerCounts, row.provider);

      const isCompleted = row.status === "completed";
      const isBillable = row.billable !== false;
      if (isCompleted && isBillable) {
        billableTranscriptionCount += 1;
        const rowDuration = row.billing_duration_seconds ?? row.audio_duration_seconds;
        const rowMinutes = row.billing_minutes;
        if (typeof rowDuration === "number" && Number.isFinite(rowDuration) && rowDuration > 0) {
          durationSeconds += rowDuration;
          billableMinutes += typeof rowMinutes === "number" && Number.isFinite(rowMinutes)
            ? rowMinutes
            : Math.max(1, Math.ceil(rowDuration / 60));
        } else {
          missingDurationCount += 1;
        }
      }
    }

    return {
      transcription_count: rows.length,
      billable_transcription_count: billableTranscriptionCount,
      success_count: statusCounts.completed || 0,
      failure_count: statusCounts.failed || 0,
      duration_seconds: Number(durationSeconds.toFixed(2)),
      billable_minutes: billableMinutes,
      missing_duration_count: missingDurationCount,
      status_counts: statusCounts,
      provider_counts: providerCounts,
    };
  }

  async getTenantSummary(query: UsageDateRangeQuery, authContext: AuthContext) {
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
      ai: this.summarizeAi(aiRows),
      sms: this.summarizeSms(smsRows),
      social_video: this.summarizeSocialVideo(socialVideoRows),
    };
  }

  async listPlatformTenantUsage(query: PlatformTenantUsageQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
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
        ai: this.summarizeAi(aiRows.filter((row) => row.tenant_id === tenant.id)),
        sms: this.summarizeSms(smsRows.filter((row) => row.tenant_id === tenant.id)),
        social_video: this.summarizeSocialVideo(
          socialVideoRows.filter((row) => row.tenant_id === tenant.id),
        ),
      })),
      pagination: tenants.pagination,
    };
  }

  async listTenantAiLogs(query: UsageAiLogsQuery, authContext: AuthContext) {
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

  async listTenantSmsLogs(query: UsageSmsLogsQuery, authContext: AuthContext) {
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

  async listTenantSocialVideoLogs(query: UsageSocialVideoLogsQuery, authContext: AuthContext) {
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

  async listPlatformAiLogs(query: UsageAiLogsQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
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

  async listPlatformSmsLogs(query: UsageSmsLogsQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
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

  async listPlatformSocialVideoLogs(query: UsageSocialVideoLogsQuery, authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
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
}

export const usageService = new UsageService();
