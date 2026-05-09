import { Errors } from "@/errors/error-factory";
import type {
  SocialVideoScriptGoal,
  SocialVideoScriptStyle,
} from "@/schema/social-video";
import { SupabaseDB } from "@/utils/supabase";

export type SocialVideoScriptRecord = {
  id: string;
  transcription_id: string;
  user_id: string | null;
  platform: "douyin";
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
    style: SocialVideoScriptStyle;
    durationSeconds: number;
    goal: SocialVideoScriptGoal;
    since: string;
  }) {
    const { data, error } = await this.table()
      .select("*")
      .eq("transcription_id", input.transcriptionId)
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
