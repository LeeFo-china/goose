import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

class AiCallLogRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("ai_call_logs");
  }

  async listUsageStatsRows(input: {
    tenantId: string | null;
    tenantIds?: string[];
    sceneCode?: string;
    status?: "success" | "failure";
    providerCode?: string;
    modelCode?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    let query = this.table()
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

    query = this.applyFilters(query, input);

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

  async list(input: {
    tenantId?: string | null;
    tenantIds?: string[];
    page: number;
    pageSize: number;
    sceneCode?: string;
    status?: "success" | "failure";
    providerCode?: string;
    modelCode?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = this.table()
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    query = this.applyFilters(query, input);

    const { data, error, count } = await query;
    if (error) {
      throw Errors.dbError("查询 AI 调用日志失败", error);
    }

    return {
      list: (data || []) as Array<{
        id: string;
        tenant_id: string | null;
        scene_code: string;
        provider_code: string | null;
        model_code: string | null;
        model_name: string | null;
        status: "success" | "failure";
        request_id: string | null;
        duration_ms: number | null;
        prompt_tokens: number | null;
        completion_tokens: number | null;
        total_tokens: number | null;
        cached_input_tokens: number | null;
        reasoning_tokens: number | null;
        raw_usage: unknown;
        error_code: string | null;
        error_message: string | null;
        source: string | null;
        billable: boolean | null;
        metadata: unknown;
        created_at: string | null;
      }>,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  private applyFilters<T extends { eq: (...args: any[]) => T; in: (...args: any[]) => T; gte: (...args: any[]) => T; lt: (...args: any[]) => T }>(
    query: T,
    input: {
      tenantId?: string | null;
      tenantIds?: string[];
      sceneCode?: string;
      status?: "success" | "failure";
      providerCode?: string;
      modelCode?: string;
      createdFrom?: string;
      createdTo?: string;
    },
  ) {
    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.tenantIds && input.tenantIds.length > 0) {
      query = query.in("tenant_id", input.tenantIds);
    }

    if (input.sceneCode) {
      query = query.eq("scene_code", input.sceneCode);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    if (input.providerCode) {
      query = query.eq("provider_code", input.providerCode);
    }

    if (input.modelCode) {
      query = query.eq("model_code", input.modelCode);
    }

    if (input.createdFrom) {
      query = query.gte("created_at", input.createdFrom);
    }

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    return query;
  }
}

export const aiCallLogRepository = new AiCallLogRepository();
