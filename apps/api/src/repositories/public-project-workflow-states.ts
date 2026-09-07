import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { WorkflowInstanceStatus } from "@gooes/domain";

export type PublicProjectWorkflowStateRow = {
  tenant_id: string;
  subject_id: string;
  instance_status: WorkflowInstanceStatus | null;
  current_node_key: string | null;
  current_node_title: string | null;
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

type PublicProjectWorkflowStateQuery = {
  select(columns: string): PublicProjectWorkflowStateQuery;
  eq(column: string, value: unknown): PublicProjectWorkflowStateQuery;
  in(column: string, values: string[]): PublicProjectWorkflowStateQuery;
  limit(value: number): PromiseLike<QueryResult>;
};

type SupabaseClient = {
  from(table: string): PublicProjectWorkflowStateQuery;
};

const PUBLIC_PROJECT_WORKFLOW_STATE_SELECT = [
  "tenant_id",
  "subject_id",
  "instance_status",
  "current_node_key",
  "current_node_title",
].join(", ");

class PublicProjectWorkflowStateRepository {
  async listByTenantProjectIds(input: {
    tenantIds: string[];
    projectIds: string[];
  }): Promise<PublicProjectWorkflowStateRow[]> {
    const tenantIds = uniqueBoundedIds(input.tenantIds);
    const projectIds = uniqueBoundedIds(input.projectIds);
    if (tenantIds.length === 0 || projectIds.length === 0) return [];

    const client = SupabaseDB.getAdminClient() as unknown as SupabaseClient;
    const { data, error } = await client
      .from("workflow_subject_states")
      .select(PUBLIC_PROJECT_WORKFLOW_STATE_SELECT)
      .eq("subject_type", "project")
      .in("tenant_id", tenantIds)
      .in("subject_id", projectIds)
      .limit(100);

    if (error) {
      throw Errors.dbError("批量查询公开项目流程状态失败", error);
    }

    return (data ?? []) as PublicProjectWorkflowStateRow[];
  }
}

function uniqueBoundedIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean))).slice(0, 100);
}

export const publicProjectWorkflowStateRepository =
  new PublicProjectWorkflowStateRepository();
