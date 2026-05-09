import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

class AiCallLogRepository {
  private client = SupabaseDB.getAdminClient();

  async listUsageStatsRows(input: {
    tenantId: string | null;
    sceneCode?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    let query = this.client
      .from("ai_call_logs")
      .select(`
        id,
        tenant_id,
        scene_code,
        provider_code,
        model_code,
        status,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        created_at
      `);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.sceneCode) {
      query = query.eq("scene_code", input.sceneCode);
    }

    if (input.createdFrom) {
      query = query.gte("created_at", input.createdFrom);
    }

    if (input.createdTo) {
      query = query.lte("created_at", input.createdTo);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询 AI 调用用量失败", error);
    }

    return (data || []) as Array<{
      id: string;
      tenant_id: string | null;
      scene_code: string;
      provider_code: string | null;
      model_code: string | null;
      status: "success" | "failure";
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
      created_at: string | null;
    }>;
  }
}

export const aiCallLogRepository = new AiCallLogRepository();
