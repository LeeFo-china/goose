import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  WorkflowBusinessKind,
  WorkflowInstanceStatus,
  WorkflowSubjectType,
} from "@gooes/domain";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  upsert: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedSupabaseClient = {
  from: (table: string) => UntypedTable;
};

export type WorkflowSubjectStateRow = {
  id: string;
  tenant_id: string;
  subject_type: WorkflowSubjectType;
  subject_id: string;
  definition_id: string | null;
  instance_id: string | null;
  instance_status: WorkflowInstanceStatus | null;
  current_node_key: string | null;
  current_node_title: string | null;
  current_business_kind: WorkflowBusinessKind | null;
  pending_task_count: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowSubjectStateUpsertInput = {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  subjectId: string;
  definitionId?: string | null;
  instanceId?: string | null;
  instanceStatus?: WorkflowInstanceStatus | null;
  currentNodeKey?: string | null;
  currentNodeTitle?: string | null;
  currentBusinessKind?: WorkflowBusinessKind | null;
  pendingTaskCount?: number;
};

export type WorkflowRuntimeProjectionRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_id: string;
  subject_type: WorkflowSubjectType;
  subject_id: string;
  status: WorkflowInstanceStatus;
  current_node_key: string | null;
  current_node_snapshot: Record<string, unknown> | null;
  started_at: string;
  created_at: string;
  updated_at: string;
};

const WORKFLOW_SUBJECT_STATE_SELECT = [
  "id",
  "tenant_id",
  "subject_type",
  "subject_id",
  "definition_id",
  "instance_id",
  "instance_status",
  "current_node_key",
  "current_node_title",
  "current_business_kind",
  "pending_task_count",
  "created_at",
  "updated_at",
].join(", ");

const WORKFLOW_RUNTIME_PROJECTION_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "version_id",
  "subject_type",
  "subject_id",
  "status",
  "current_node_key",
  "current_node_snapshot",
  "started_at",
  "created_at",
  "updated_at",
].join(", ");

function table(name: string) {
  return (SupabaseDB.getAdminClient() as unknown as UntypedSupabaseClient)
    .from(name);
}

class WorkflowSubjectStateRepository {
  async upsert(
    input: WorkflowSubjectStateUpsertInput,
  ): Promise<WorkflowSubjectStateRow> {
    const { data, error } = await table("workflow_subject_states")
      .upsert({
        tenant_id: input.tenantId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        definition_id: input.definitionId ?? null,
        instance_id: input.instanceId ?? null,
        instance_status: input.instanceStatus ?? null,
        current_node_key: input.currentNodeKey ?? null,
        current_node_title: input.currentNodeTitle ?? null,
        current_business_kind: input.currentBusinessKind ?? null,
        pending_task_count: input.pendingTaskCount ?? 0,
      }, {
        onConflict: "tenant_id,subject_type,subject_id",
      })
      .select(WORKFLOW_SUBJECT_STATE_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("保存流程对象状态失败", error);
    }

    return data as WorkflowSubjectStateRow;
  }

  async find(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectId: string;
  }): Promise<WorkflowSubjectStateRow | null> {
    const { data, error } = await table("workflow_subject_states")
      .select(WORKFLOW_SUBJECT_STATE_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程对象状态失败", error);
    }

    return data as WorkflowSubjectStateRow | null;
  }

  async listBySubjectIds(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
  }): Promise<WorkflowSubjectStateRow[]> {
    if (input.subjectIds.length === 0) {
      return [];
    }

    const { data, error } = await table("workflow_subject_states")
      .select(WORKFLOW_SUBJECT_STATE_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("subject_type", input.subjectType)
      .in("subject_id", Array.from(new Set(input.subjectIds)))
      .order("updated_at", { ascending: false });

    if (error) {
      throw Errors.dbError("批量查询流程对象状态失败", error);
    }

    return (data ?? []) as WorkflowSubjectStateRow[];
  }

  async findLatestRuntimeInstance(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectId: string;
  }): Promise<WorkflowRuntimeProjectionRow | null> {
    return await this.findLatestRuntimeInstanceByStatus({
      ...input,
      status: "running",
    }) ?? await this.findLatestRuntimeInstanceByStatus({
      ...input,
      status: "completed",
    });
  }

  private async findLatestRuntimeInstanceByStatus(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectId: string;
    status: WorkflowInstanceStatus;
  }): Promise<WorkflowRuntimeProjectionRow | null> {
    const { data, error } = await table("workflow_instances")
      .select(WORKFLOW_RUNTIME_PROJECTION_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .eq("status", input.status)
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程运行实例失败", error);
    }

    return data as WorkflowRuntimeProjectionRow | null;
  }

  async listLatestRuntimeInstancesBySubjectIds(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
  }): Promise<WorkflowRuntimeProjectionRow[]> {
    const subjectIds = Array.from(new Set(input.subjectIds));
    if (subjectIds.length === 0) {
      return [];
    }

    const [runningInstances, completedInstances] = await Promise.all([
      this.listLatestRuntimeInstancesBySubjectIdsAndStatus({
        ...input,
        subjectIds,
        status: "running",
      }),
      this.listLatestRuntimeInstancesBySubjectIdsAndStatus({
        ...input,
        subjectIds,
        status: "completed",
      }),
    ]);

    return pickLatestRuntimeInstancePerSubject([
      ...runningInstances,
      ...completedInstances,
    ]);
  }

  private async listLatestRuntimeInstancesBySubjectIdsAndStatus(input: {
    tenantId: string;
    subjectType: WorkflowSubjectType;
    subjectIds: string[];
    status: WorkflowInstanceStatus;
  }): Promise<WorkflowRuntimeProjectionRow[]> {
    const { data, error } = await table("workflow_instances")
      .select(WORKFLOW_RUNTIME_PROJECTION_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("subject_type", input.subjectType)
      .in("subject_id", input.subjectIds)
      .eq("status", input.status)
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(input.subjectIds.length * 5, 500));

    if (error) {
      throw Errors.dbError("批量查询流程运行实例失败", error);
    }

    return (data ?? []) as WorkflowRuntimeProjectionRow[];
  }

  async countPendingTasks(input: {
    tenantId: string;
    instanceId: string;
  }): Promise<number> {
    const { error, count } = await table("workflow_tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .eq("instance_id", input.instanceId)
      .eq("status", "pending");

    if (error) {
      throw Errors.dbError("统计流程待办失败", error);
    }

    return count ?? 0;
  }
}

export const workflowSubjectStateRepository =
  new WorkflowSubjectStateRepository();

function pickLatestRuntimeInstancePerSubject(
  instances: WorkflowRuntimeProjectionRow[],
): WorkflowRuntimeProjectionRow[] {
  const result = new Map<string, WorkflowRuntimeProjectionRow>();
  for (const instance of instances) {
    if (result.has(instance.subject_id)) continue;
    result.set(instance.subject_id, instance);
  }
  return Array.from(result.values());
}
