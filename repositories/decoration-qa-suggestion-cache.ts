import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type DecorationQaSuggestionSource = "ai" | "fallback";

export type DecorationQaSuggestionCacheRow = {
  id: string;
  cache_key: string;
  scene: "visitor" | "customer" | "employee";
  project_id: string | null;
  questions: unknown;
  source: DecorationQaSuggestionSource;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

class DecorationQaSuggestionCacheRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findValid(cacheKey: string, now: Date) {
    const { data, error } = await this.adminClient
      .from("ai_decoration_qa_suggestion_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .gt("expires_at", now.toISOString())
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询推荐问题缓存失败", error);
    }

    return (data || null) as DecorationQaSuggestionCacheRow | null;
  }

  async upsert(input: {
    cache_key: string;
    scene: "visitor" | "customer" | "employee";
    project_id: string | null;
    questions: string[];
    source: DecorationQaSuggestionSource;
    expires_at: string;
  }) {
    const { data, error } = await this.adminClient
      .from("ai_decoration_qa_suggestion_cache")
      .upsert(
        {
          cache_key: input.cache_key,
          scene: input.scene,
          project_id: input.project_id,
          questions: input.questions,
          source: input.source,
          expires_at: input.expires_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" },
      )
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存推荐问题缓存失败", error);
    }

    return data as DecorationQaSuggestionCacheRow;
  }
}

export const decorationQaSuggestionCacheRepository =
  new DecorationQaSuggestionCacheRepository();
