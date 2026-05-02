import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type OpsScriptRunStatus = "running" | "success" | "failed" | "timeout";

export type OpsScriptRunRecord = {
  id: string;
  script_key: string;
  script_label: string;
  status: OpsScriptRunStatus;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  executed_by_employee_id: string | null;
  reason: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  executed_by?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

type ListParams = {
  page: number;
  pageSize: number;
  scriptKey?: string;
  status?: OpsScriptRunStatus;
};

class OpsScriptRunRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("ops_script_runs");
  }

  async create(input: {
    script_key: string;
    script_label: string;
    executed_by_employee_id: string | null;
    reason: string | null;
  }): Promise<OpsScriptRunRecord> {
    const { data, error } = await this.table()
      .insert({
        ...input,
        status: "running",
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建脚本执行记录失败", error);
    }

    return data as OpsScriptRunRecord;
  }

  async finish(
    id: string,
    input: {
      status: OpsScriptRunStatus;
      exit_code: number | null;
      stdout: string;
      stderr: string;
      duration_ms: number;
    },
  ): Promise<OpsScriptRunRecord> {
    const { data, error } = await this.table()
      .update({
        status: input.status,
        exit_code: input.exit_code,
        stdout: input.stdout,
        stderr: input.stderr,
        duration_ms: input.duration_ms,
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新脚本执行记录失败", error);
    }

    return data as OpsScriptRunRecord;
  }

  async list(params: ListParams) {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = this.table()
      .select(`
        *,
        executed_by:employees!ops_script_runs_executed_by_employee_id_fkey (
          id,
          name,
          phone
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (params.scriptKey) {
      query = query.eq("script_key", params.scriptKey);
    }

    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询脚本执行记录失败", error);
    }

    return {
      list: ((data || []) as OpsScriptRunRecord[]).map((item) => ({
        ...item,
        stdout: item.stdout ? item.stdout.slice(0, 12000) : null,
        stderr: item.stderr ? item.stderr.slice(0, 12000) : null,
      })),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / params.pageSize) : 0,
      },
    };
  }
}

export const opsScriptRunRepository = new OpsScriptRunRepository();

