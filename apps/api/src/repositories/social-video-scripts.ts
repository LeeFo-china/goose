import { Errors } from "@/errors/error-factory";
import type {
  SocialVideoScriptGoal,
  SocialVideoScriptStyle,
  SocialVideoScriptTargetPlatform,
} from "@/schema/social-video";
import { SupabaseDB } from "@/utils/supabase";

export type SocialVideoScriptRecord = {
  id: string;
  transcription_id: string;
  user_id: string | null;
  platform: "douyin";
  target_platform: SocialVideoScriptTargetPlatform;
  style: SocialVideoScriptStyle;
  duration_seconds: number;
  goal: SocialVideoScriptGoal;
  title: string;
  rewritten_copy: string;
  hook: string;
  shooting_script: unknown;
  cover_text_options: unknown;
  caption_options: unknown;
  tips: unknown;
  source_text_length: number;
  prompt_version: string;
  model_provider: string | null;
  model_name: string | null;
  status: "completed" | "failed";
  error_code: string | null;
  error_message: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

type CreateSocialVideoScriptRecordInput = {
  transcriptionId: string;
  userId: string | null;
  platform: "douyin";
  targetPlatform: SocialVideoScriptTargetPlatform;
  style: SocialVideoScriptStyle;
  durationSeconds: number;
  goal: SocialVideoScriptGoal;
  title: string;
  rewrittenCopy: string;
  hook: string;
  shootingScript: unknown;
  coverTextOptions: unknown;
  captionOptions: unknown;
  tips: unknown;
  sourceTextLength: number;
  promptVersion: string;
  modelProvider: string | null;
  modelName: string | null;
  status: "completed" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
  rawPayload?: unknown;
};

class SocialVideoScriptRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("social_video_scripts");
  }

  async create(input: CreateSocialVideoScriptRecordInput) {
    const { data, error } = await this.table()
      .insert({
        transcription_id: input.transcriptionId,
        user_id: input.userId,
        platform: input.platform,
        target_platform: input.targetPlatform,
        style: input.style,
        duration_seconds: input.durationSeconds,
        goal: input.goal,
        title: input.title,
        rewritten_copy: input.rewrittenCopy,
        hook: input.hook,
        shooting_script: input.shootingScript,
        cover_text_options: input.coverTextOptions,
        caption_options: input.captionOptions,
        tips: input.tips,
        source_text_length: input.sourceTextLength,
        prompt_version: input.promptVersion,
        model_provider: input.modelProvider,
        model_name: input.modelName,
        status: input.status,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        raw_payload: input.rawPayload ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存短视频脚本失败", error);
    }

    return data as SocialVideoScriptRecord;
  }

  async findRecentCompleted(input: {
    transcriptionId: string;
    targetPlatform: SocialVideoScriptTargetPlatform;
    style: SocialVideoScriptStyle;
    durationSeconds: number;
    goal: SocialVideoScriptGoal;
    since: string;
  }) {
    const { data, error } = await this.table()
      .select("*")
      .eq("transcription_id", input.transcriptionId)
      .eq("target_platform", input.targetPlatform)
      .eq("style", input.style)
      .eq("duration_seconds", input.durationSeconds)
      .eq("goal", input.goal)
      .eq("status", "completed")
      .gte("created_at", input.since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询短视频脚本缓存失败", error);
    }

    return (data || null) as SocialVideoScriptRecord | null;
  }

  async listByTranscription(input: {
    transcriptionId: string;
    page: number;
    pageSize: number;
    targetPlatform?: SocialVideoScriptTargetPlatform;
    style?: SocialVideoScriptStyle;
    status?: "completed" | "failed";
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.table()
      .select("*", { count: "exact" })
      .eq("transcription_id", input.transcriptionId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.targetPlatform) {
      query = query.eq("target_platform", input.targetPlatform);
    }

    if (input.style) {
      query = query.eq("style", input.style);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    const { data, count, error } = await query;
    if (error) {
      throw Errors.dbError("查询短视频脚本历史失败", error);
    }

    return {
      items: (data || []) as SocialVideoScriptRecord[],
      total: count || 0,
    };
  }

  async listAll(input: {
    page: number;
    pageSize: number;
    targetPlatform?: SocialVideoScriptTargetPlatform;
    style?: SocialVideoScriptStyle;
    status?: "completed" | "failed";
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.table()
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.targetPlatform) {
      query = query.eq("target_platform", input.targetPlatform);
    }

    if (input.style) {
      query = query.eq("style", input.style);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    const { data, count, error } = await query;
    if (error) {
      throw Errors.dbError("查询短视频脚本列表失败", error);
    }

    return {
      items: (data || []) as SocialVideoScriptRecord[],
      total: count || 0,
    };
  }

  async countCreatedByUserSince(input: {
    userId: string;
    since: string;
  }) {
    const { count, error } = await this.table()
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", input.since);

    if (error) {
      throw Errors.dbError("查询短视频脚本生成次数失败", error);
    }

    return count || 0;
  }
}

export const socialVideoScriptRepository = new SocialVideoScriptRepository();
