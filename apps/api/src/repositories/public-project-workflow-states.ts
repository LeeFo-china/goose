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
  or(filters: string): PublicProjectWorkflowStateQuery;
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

const SAFE_FILTER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_PUBLIC_PROJECT_PAIRS = 100;
const PUBLIC_PROJECT_PAIR_CHUNK_SIZE = 25;

class PublicProjectWorkflowStateRepository {
  async listByTenantProjectIds(input: {
    pairs: Array<{ tenantId: string; projectId: string }>;
  }): Promise<PublicProjectWorkflowStateRow[]> {
    const pairs = uniqueBoundedPairs(input.pairs);
    if (pairs.length === 0) return [];

    const client = SupabaseDB.getAdminClient() as unknown as SupabaseClient;
    const chunks = chunkPairs(pairs, PUBLIC_PROJECT_PAIR_CHUNK_SIZE);
    const results = await Promise.all(chunks.map(async (chunk) => {
      const { data, error } = await client
        .from("workflow_subject_states")
        .select(PUBLIC_PROJECT_WORKFLOW_STATE_SELECT)
        .eq("subject_type", "project")
        .or(chunk.map((pair) =>
          `and(tenant_id.eq.${pair.tenantId},subject_id.eq.${pair.projectId})`
        ).join(","))
        .limit(chunk.length);

      if (error) {
        throw Errors.dbError("批量查询公开项目流程状态失败", error);
      }

      return (data ?? []) as PublicProjectWorkflowStateRow[];
    }));

    return results.flat();
  }
}

function uniqueBoundedPairs(
  pairs: Array<{ tenantId: string; projectId: string }>,
): Array<{ tenantId: string; projectId: string }> {
  const result = new Map<string, { tenantId: string; projectId: string }>();
  for (const pair of pairs) {
    if (
      !SAFE_FILTER_ID_PATTERN.test(pair.tenantId)
      || !SAFE_FILTER_ID_PATTERN.test(pair.projectId)
    ) {
      continue;
    }
    result.set(`${pair.tenantId}:${pair.projectId}`, pair);
    if (result.size === MAX_PUBLIC_PROJECT_PAIRS) break;
  }
  return [...result.values()];
}

function chunkPairs(
  pairs: Array<{ tenantId: string; projectId: string }>,
  chunkSize: number,
): Array<Array<{ tenantId: string; projectId: string }>> {
  const chunks: Array<Array<{ tenantId: string; projectId: string }>> = [];
  for (let index = 0; index < pairs.length; index += chunkSize) {
    chunks.push(pairs.slice(index, index + chunkSize));
  }
  return chunks;
}

export const publicProjectWorkflowStateRepository =
  new PublicProjectWorkflowStateRepository();
