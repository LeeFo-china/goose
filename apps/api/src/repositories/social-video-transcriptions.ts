import { Errors } from "@/errors/error-factory";
import type { SocialVideoTranscriptionStatus } from "@/schema/social-video";
import { SupabaseDB } from "@/utils/supabase";

export type SocialVideoTranscriptionRecord = {
  id: string;
  tenant_id: string | null;
  platform: "douyin";
  source_url: string;
  normalized_url: string;
  input_hash: string;
  status: SocialVideoTranscriptionStatus;
  progress: number;
  provider: string | null;
  provider_actor_id: string | null;
  provider_run_id: string | null;
  provider_dataset_id: string | null;
  resolved_video_url: string | null;
  resolved_audio_url: string | null;
  asr_task_id: string | null;
  media_file_size_bytes: number | null;
  audio_file_size_bytes: number | null;
  audio_duration_seconds: number | null;
  billable: boolean;
  billing_duration_seconds: number | null;
  billing_minutes: number | null;
  billing_source: string | null;
  billed_at: string | null;
  title: string | null;
  text: string | null;
  segments: unknown;
  raw_payload: unknown;
  error_code: string | null;
  error_message: string | null;
  created_by_auth_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type CreateSocialVideoTranscriptionRecordInput = {
  tenantId: string | null;
  platform: "douyin";
  sourceUrl: string;
  normalizedUrl: string;
  inputHash: string;
  createdByAuthUserId: string | null;
  billable?: boolean;
  billingSource?: string | null;
};

type UpdateSocialVideoTranscriptionRecordInput = {
  status?: SocialVideoTranscriptionStatus;
  progress?: number;
  provider?: string | null;
  providerActorId?: string | null;
  providerRunId?: string | null;
  providerDatasetId?: string | null;
  resolvedVideoUrl?: string | null;
  resolvedAudioUrl?: string | null;
  asrTaskId?: string | null;
  mediaFileSizeBytes?: number | null;
  audioFileSizeBytes?: number | null;
  audioDurationSeconds?: number | null;
  billable?: boolean;
  billingDurationSeconds?: number | null;
  billingMinutes?: number | null;
  billingSource?: string | null;
  billedAt?: string | null;
  title?: string | null;
  text?: string | null;
  segments?: unknown;
  rawPayload?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

class SocialVideoTranscriptionRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("social_video_transcriptions");
  }

  async create(input: CreateSocialVideoTranscriptionRecordInput) {
    const { data, error } = await this.table()
      .insert({
        tenant_id: input.tenantId,
        platform: input.platform,
        source_url: input.sourceUrl,
        normalized_url: input.normalizedUrl,
        input_hash: input.inputHash,
        status: "pending",
        progress: 0,
        created_by_auth_user_id: input.createdByAuthUserId,
        billable: input.billable ?? true,
        billing_source: input.billingSource ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建短视频识别任务失败", error);
    }

    return data as SocialVideoTranscriptionRecord;
  }

  async findById(id: string, tenantId?: string | null) {
    let query = this.table()
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询短视频识别任务失败", error);
    }

    return (data || null) as SocialVideoTranscriptionRecord | null;
  }

  async findRecentCompletedByHash(input: {
    tenantId: string | null;
    inputHash: string;
    since: string;
  }) {
    let query = this.table()
      .select("*")
      .eq("input_hash", input.inputHash)
      .eq("status", "completed")
      .gte("completed_at", input.since);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询短视频识别缓存失败", error);
    }

    return (data || null) as SocialVideoTranscriptionRecord | null;
  }

  async countCreatedByUserSince(input: {
    tenantId: string | null;
    authUserId: string;
    since: string;
  }) {
    let query = this.table()
      .select("id", { count: "exact", head: true })
      .eq("created_by_auth_user_id", input.authUserId)
      .gte("created_at", input.since);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { count, error } = await query;

    if (error) {
      throw Errors.dbError("查询短视频识别次数失败", error);
    }

    return count || 0;
  }

  async claimNextPending(staleBefore: string) {
    const { data, error } = await this.client.rpc(
      "claim_next_social_video_transcription",
      {
        p_stale_before: staleBefore,
      },
    );

    if (error) {
      throw Errors.dbError("领取短视频识别任务失败", error);
    }

    const record = Array.isArray(data) ? data[0] : data;
    return (record || null) as SocialVideoTranscriptionRecord | null;
  }

  async update(id: string, input: UpdateSocialVideoTranscriptionRecordInput) {
    const payload: Record<string, unknown> = {};

    if (input.status !== undefined) payload.status = input.status;
    if (input.progress !== undefined) payload.progress = input.progress;
    if (input.provider !== undefined) payload.provider = input.provider;
    if (input.providerActorId !== undefined) payload.provider_actor_id = input.providerActorId;
    if (input.providerRunId !== undefined) payload.provider_run_id = input.providerRunId;
    if (input.providerDatasetId !== undefined) payload.provider_dataset_id = input.providerDatasetId;
    if (input.resolvedVideoUrl !== undefined) payload.resolved_video_url = input.resolvedVideoUrl;
    if (input.resolvedAudioUrl !== undefined) payload.resolved_audio_url = input.resolvedAudioUrl;
    if (input.asrTaskId !== undefined) payload.asr_task_id = input.asrTaskId;
    if (input.mediaFileSizeBytes !== undefined) payload.media_file_size_bytes = input.mediaFileSizeBytes;
    if (input.audioFileSizeBytes !== undefined) payload.audio_file_size_bytes = input.audioFileSizeBytes;
    if (input.audioDurationSeconds !== undefined) payload.audio_duration_seconds = input.audioDurationSeconds;
    if (input.billable !== undefined) payload.billable = input.billable;
    if (input.billingDurationSeconds !== undefined) payload.billing_duration_seconds = input.billingDurationSeconds;
    if (input.billingMinutes !== undefined) payload.billing_minutes = input.billingMinutes;
    if (input.billingSource !== undefined) payload.billing_source = input.billingSource;
    if (input.billedAt !== undefined) payload.billed_at = input.billedAt;
    if (input.title !== undefined) payload.title = input.title;
    if (input.text !== undefined) payload.text = input.text;
    if (input.segments !== undefined) payload.segments = input.segments;
    if (input.rawPayload !== undefined) payload.raw_payload = input.rawPayload;
    if (input.errorCode !== undefined) payload.error_code = input.errorCode;
    if (input.errorMessage !== undefined) payload.error_message = input.errorMessage;
    if (input.completedAt !== undefined) payload.completed_at = input.completedAt;

    const { data, error } = await this.table()
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新短视频识别任务失败", error);
    }

    return data as SocialVideoTranscriptionRecord;
  }

  async listUsageStatsRows(input: {
    tenantId: string | null;
    tenantIds?: string[];
    createdFrom?: string;
    createdTo?: string;
  }) {
    let query = this.table()
      .select(`
        id,
        tenant_id,
        status,
        provider,
        audio_duration_seconds,
        billable,
        billing_duration_seconds,
        billing_minutes,
        billing_source,
        created_at
      `);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.tenantIds && input.tenantIds.length > 0) {
      query = query.in("tenant_id", input.tenantIds);
    }

    if (input.createdFrom) {
      query = query.gte("created_at", input.createdFrom);
    }

    if (input.createdTo) {
      query = query.lte("created_at", input.createdTo);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询短视频识别用量失败", error);
    }

    return (data || []) as Array<{
      id: string;
      tenant_id: string | null;
      status: SocialVideoTranscriptionStatus;
      provider: string | null;
      audio_duration_seconds: number | null;
      billable: boolean | null;
      billing_duration_seconds: number | null;
      billing_minutes: number | null;
      billing_source: string | null;
      created_at: string | null;
    }>;
  }

  async listUsageLogs(input: {
    tenantId?: string | null;
    page: number;
    pageSize: number;
    status?: SocialVideoTranscriptionStatus;
    provider?: string;
    billable?: boolean;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.table()
      .select(`
        id,
        tenant_id,
        platform,
        source_url,
        normalized_url,
        resolved_video_url,
        status,
        provider,
        audio_duration_seconds,
        billable,
        billing_duration_seconds,
        billing_minutes,
        billing_source,
        error_code,
        error_message,
        created_at,
        completed_at
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    if (input.provider) {
      query = query.eq("provider", input.provider);
    }

    if (input.billable !== undefined) {
      query = query.eq("billable", input.billable);
    }

    if (input.createdFrom) {
      query = query.gte("created_at", input.createdFrom);
    }

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    const { data, error, count } = await query;

    if (error) {
      throw Errors.dbError("查询短视频识别用量明细失败", error);
    }

    return {
      list: (data || []) as Array<{
        id: string;
        tenant_id: string | null;
        platform: "douyin";
        source_url: string;
        normalized_url: string;
        resolved_video_url: string | null;
        status: SocialVideoTranscriptionStatus;
        provider: string | null;
        audio_duration_seconds: number | null;
        billable: boolean | null;
        billing_duration_seconds: number | null;
        billing_minutes: number | null;
        billing_source: string | null;
        error_code: string | null;
        error_message: string | null;
        created_at: string | null;
        completed_at: string | null;
      }>,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }
}

export const socialVideoTranscriptionRepository =
  new SocialVideoTranscriptionRepository();
