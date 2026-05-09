import { Errors } from "@/errors/error-factory";
import type { SocialVideoTranscriptionStatus } from "@/schema/social-video";
import { SupabaseDB } from "@/utils/supabase";

export type SocialVideoTranscriptionRecord = {
  id: string;
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
  platform: "douyin";
  sourceUrl: string;
  normalizedUrl: string;
  inputHash: string;
  createdByAuthUserId: string | null;
};

type UpdateSocialVideoTranscriptionRecordInput = {
  status?: SocialVideoTranscriptionStatus;
  progress?: number;
  provider?: string | null;
  providerActorId?: string | null;
  providerRunId?: string | null;
  providerDatasetId?: string | null;
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
        platform: input.platform,
        source_url: input.sourceUrl,
        normalized_url: input.normalizedUrl,
        input_hash: input.inputHash,
        status: "pending",
        progress: 0,
        created_by_auth_user_id: input.createdByAuthUserId,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建短视频识别任务失败", error);
    }

    return data as SocialVideoTranscriptionRecord;
  }

  async findById(id: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询短视频识别任务失败", error);
    }

    return (data || null) as SocialVideoTranscriptionRecord | null;
  }

  async findRecentCompletedByHash(input: {
    inputHash: string;
    since: string;
  }) {
    const { data, error } = await this.table()
      .select("*")
      .eq("input_hash", input.inputHash)
      .eq("status", "completed")
      .gte("completed_at", input.since)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询短视频识别缓存失败", error);
    }

    return (data || null) as SocialVideoTranscriptionRecord | null;
  }

  async countCreatedByUserSince(input: {
    authUserId: string;
    since: string;
  }) {
    const { count, error } = await this.table()
      .select("id", { count: "exact", head: true })
      .eq("created_by_auth_user_id", input.authUserId)
      .gte("created_at", input.since);

    if (error) {
      throw Errors.dbError("查询短视频识别次数失败", error);
    }

    return count || 0;
  }

  async update(id: string, input: UpdateSocialVideoTranscriptionRecordInput) {
    const payload: Record<string, unknown> = {};

    if (input.status !== undefined) payload.status = input.status;
    if (input.progress !== undefined) payload.progress = input.progress;
    if (input.provider !== undefined) payload.provider = input.provider;
    if (input.providerActorId !== undefined) payload.provider_actor_id = input.providerActorId;
    if (input.providerRunId !== undefined) payload.provider_run_id = input.providerRunId;
    if (input.providerDatasetId !== undefined) payload.provider_dataset_id = input.providerDatasetId;
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
}

export const socialVideoTranscriptionRepository =
  new SocialVideoTranscriptionRepository();
