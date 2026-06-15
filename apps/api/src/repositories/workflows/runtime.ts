import { Errors } from "@/errors/error-factory";
import { workflowRpc, workflowTable } from "./client";
import { WORKFLOW_INSTANCE_SELECT } from "./shared";
import type {
  WorkflowInstanceRow,
  WorkflowInstanceNodeRow,
  WorkflowRuntimeCancelInput,
  WorkflowRuntimeCancelResult,
  WorkflowRuntimeCompleteNodeInput,
  WorkflowRuntimeCompleteNodeResult,
  WorkflowRuntimeInstanceListInput,
  WorkflowRuntimeInstanceListResult,
  WorkflowRuntimeRebuildInput,
  WorkflowRuntimeRebuildResult,
  WorkflowRuntimeStartInput,
  WorkflowRuntimeStartResult,
  WorkflowTaskRow,
} from "./types";

type WorkflowRuntimeStartFailure =
  Extract<WorkflowRuntimeStartResult, { ok: false }>;
type WorkflowRuntimeCompleteNodeFailure =
  Extract<WorkflowRuntimeCompleteNodeResult, { ok: false }>;
type WorkflowRuntimeCancelFailure =
  Extract<WorkflowRuntimeCancelResult, { ok: false }>;
type WorkflowRuntimeRebuildFailure =
  Extract<WorkflowRuntimeRebuildResult, { ok: false }>;

export async function listRuntimeInstances(
  input: WorkflowRuntimeInstanceListInput,
): Promise<WorkflowRuntimeInstanceListResult> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = workflowTable("workflow_instances")
    .select(WORKFLOW_INSTANCE_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)
    .eq("definition_id", input.definitionId);

  if (input.status) request = request.eq("status", input.status);
  if (input.subjectType) request = request.eq("subject_type", input.subjectType);
  if (input.subjectId) request = request.eq("subject_id", input.subjectId);

  const { data, error, count } = await request
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询流程运行实例失败", error);
  }

  const total = count ?? 0;
  return {
    list: (data ?? []) as WorkflowInstanceRow[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function getRuntimeInstanceById(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
}): Promise<WorkflowInstanceRow | null> {
  const { data, error } = await workflowTable("workflow_instances")
    .select(WORKFLOW_INSTANCE_SELECT)
    .eq("tenant_id", input.tenantId)
    .eq("definition_id", input.definitionId)
    .eq("id", input.instanceId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询流程运行实例失败", error);
  }

  return data as WorkflowInstanceRow | null;
}

export async function findLatestRunningRuntimeInstance(input: {
  tenantId: string;
  subjectType: string;
  subjectId: string;
}): Promise<WorkflowInstanceRow | null> {
  const { data, error } = await workflowTable("workflow_instances")
    .select(WORKFLOW_INSTANCE_SELECT)
    .eq("tenant_id", input.tenantId)
    .eq("subject_type", input.subjectType)
    .eq("subject_id", input.subjectId)
    .eq("status", "running")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询流程运行实例失败", error);
  }

  return data as WorkflowInstanceRow | null;
}

export async function listCompletedRuntimeProcedureNodes(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
}): Promise<WorkflowInstanceNodeRow[]> {
  const { data, error } = await workflowTable("workflow_instance_nodes")
    .select([
      "id",
      "tenant_id",
      "instance_id",
      "definition_id",
      "version_id",
      "node_id",
      "node_key",
      "node_type",
      "node_snapshot",
      "status",
      "input",
      "output",
      "started_by",
      "completed_by",
      "started_at",
      "completed_at",
      "created_at",
      "updated_at",
    ].join(", "))
    .eq("tenant_id", input.tenantId)
    .eq("definition_id", input.definitionId)
    .eq("instance_id", input.instanceId)
    .eq("node_type", "procedure")
    .eq("status", "completed")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    throw Errors.dbError("查询流程实例工序节点失败", error);
  }

  return (data ?? []) as WorkflowInstanceNodeRow[];
}

export async function listRuntimeInstanceNodes(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
}): Promise<WorkflowInstanceNodeRow[]> {
  const { data, error } = await workflowTable("workflow_instance_nodes")
    .select([
      "id",
      "tenant_id",
      "instance_id",
      "definition_id",
      "version_id",
      "node_id",
      "node_key",
      "node_type",
      "node_snapshot",
      "status",
      "input",
      "output",
      "started_by",
      "completed_by",
      "started_at",
      "completed_at",
      "created_at",
      "updated_at",
    ].join(", "))
    .eq("tenant_id", input.tenantId)
    .eq("definition_id", input.definitionId)
    .eq("instance_id", input.instanceId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    throw Errors.dbError("查询流程实例节点失败", error);
  }

  return (data ?? []) as WorkflowInstanceNodeRow[];
}

export async function startRuntimeInstance(
  input: WorkflowRuntimeStartInput,
): Promise<WorkflowRuntimeStartResult> {
  const { data, error } = await workflowRpc("start_workflow_instance", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_context: input.context,
    p_started_by: input.startedBy ?? null,
  });

  if (error) {
    throw Errors.dbError("启动流程实例失败", error);
  }

  return normalizeStartResult(data);
}

export async function completeRuntimeNode(
  input: WorkflowRuntimeCompleteNodeInput,
): Promise<WorkflowRuntimeCompleteNodeResult> {
  const { data, error } = await workflowRpc("complete_workflow_instance_node", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_instance_id: input.instanceId,
    p_node_key: input.nodeKey,
    p_action: input.action,
    p_output: input.output,
    p_actor_employee_id: input.actorEmployeeId ?? null,
  });

  if (error) {
    throw Errors.dbError("完成流程节点失败", error);
  }

  return normalizeCompleteResult(data);
}

export async function cancelRuntimeInstance(
  input: WorkflowRuntimeCancelInput,
): Promise<WorkflowRuntimeCancelResult> {
  const { data, error } = await workflowRpc("cancel_workflow_instance", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_instance_id: input.instanceId,
    p_reason: input.reason ?? null,
    p_context: input.context,
    p_actor_employee_id: input.actorEmployeeId ?? null,
  });

  if (error) {
    throw Errors.dbError("取消流程实例失败", error);
  }

  return normalizeCancelResult(data);
}

export async function rebuildRuntimeInstance(
  input: WorkflowRuntimeRebuildInput,
): Promise<WorkflowRuntimeRebuildResult> {
  const { data, error } = await workflowRpc("rebuild_workflow_subject_runtime", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_reason: input.reason,
    p_context: input.context,
    p_actor_employee_id: input.actorEmployeeId ?? null,
    p_project_status: input.projectStatus ?? null,
    p_delete_completed_instances: input.deleteCompletedInstances ?? false,
    p_dry_run: input.dryRun ?? false,
  });

  if (error) {
    throw Errors.dbError("重建流程实例失败", error);
  }

  return normalizeRebuildResult(data);
}

function normalizeStartResult(data: unknown): WorkflowRuntimeStartResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("启动流程实例失败");
  }

  if (data.ok === false && typeof data.reason === "string") {
    return {
      ok: false,
      reason: data.reason as WorkflowRuntimeStartFailure["reason"],
    };
  }

  if (
    data.ok !== true ||
    !isRecord(data.instance) ||
    !isRecord(data.current_node)
  ) {
    throw Errors.badRequest("启动流程实例失败");
  }

  return {
    ok: true,
    instance: data.instance as WorkflowInstanceRow,
    currentNode: data.current_node,
    task: isRecord(data.task) ? data.task as WorkflowTaskRow : null,
  };
}

function normalizeCompleteResult(data: unknown): WorkflowRuntimeCompleteNodeResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("完成流程节点失败");
  }

  if (data.ok === false && typeof data.reason === "string") {
    return {
      ok: false,
      reason: data.reason as WorkflowRuntimeCompleteNodeFailure["reason"],
      currentNodeKey: typeof data.current_node_key === "string"
        ? data.current_node_key
        : null,
    };
  }

  if (
    data.ok !== true ||
    !isRecord(data.instance) ||
    !isRecord(data.completed_node)
  ) {
    throw Errors.badRequest("完成流程节点失败");
  }

  return {
    ok: true,
    instance: data.instance as WorkflowInstanceRow,
    completedNode: data.completed_node,
    nextNode: isRecord(data.next_node) ? data.next_node : null,
    task: isRecord(data.task) ? data.task as WorkflowTaskRow : null,
  };
}

function normalizeRebuildResult(data: unknown): WorkflowRuntimeRebuildResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("重建流程实例失败");
  }

  if (data.ok === false && typeof data.reason === "string") {
    return {
      ok: false,
      reason: data.reason as WorkflowRuntimeRebuildFailure["reason"],
    };
  }

  if (data.ok !== true) {
    throw Errors.badRequest("重建流程实例失败");
  }

  return {
    ok: true,
    dryRun: data.dry_run === true,
    instance: isRecord(data.instance) ? data.instance as WorkflowInstanceRow : null,
    currentNode: isRecord(data.current_node) ? data.current_node : null,
    task: isRecord(data.task) ? data.task as WorkflowTaskRow : null,
    subjectState: isRecord(data.subject_state) ? data.subject_state : null,
    canceledInstanceCount: getNumber(data.canceled_instance_count),
    deletedInstanceCount: getNumber(data.deleted_instance_count),
    existingInstanceCount: getNumber(data.existing_instance_count),
  };
}

function normalizeCancelResult(data: unknown): WorkflowRuntimeCancelResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("取消流程实例失败");
  }

  if (data.ok === false && typeof data.reason === "string") {
    return {
      ok: false,
      reason: data.reason as WorkflowRuntimeCancelFailure["reason"],
    };
  }

  if (data.ok !== true || !isRecord(data.instance)) {
    throw Errors.badRequest("取消流程实例失败");
  }

  return {
    ok: true,
    instance: data.instance as WorkflowInstanceRow,
  };
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
