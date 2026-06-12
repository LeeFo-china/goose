import { SupabaseDB } from "@/utils/supabase";
import {
  type BackfillInstanceStatus,
  type BackfillSubjectType,
  type SnapshotNode,
  shouldCreatePendingTask,
} from "./plan";
import {
  PAGE_SIZE,
  SUBJECT_WORKFLOW_KEY,
  type ExistingInstanceRow,
  type LegacySubjectRow,
  type WorkflowBinding,
  type WorkflowDefinitionRow,
  type WorkflowVersionRow,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ExpenseApprovalAuditRow = {
  step: string | null;
  action: string | null;
  approval_round: number | null;
  created_at: string | null;
};

function getLatestApprovalRound(approvals: ExpenseApprovalAuditRow[]) {
  return approvals.reduce((max, item) => {
    const round = Number(item.approval_round ?? 1);
    return Number.isFinite(round) && round > max ? round : max;
  }, 1);
}

function resolveExpenseWorkflowStep(row: {
  status: string | null;
  approvals?: ExpenseApprovalAuditRow[] | null;
}) {
  if (row.status === "draft") return "draft";
  if (row.status === "approved") return "payment";
  if (row.status === "paid") return "done";
  if (row.status === "rejected") return "draft";
  if (row.status === "cancelled") return "cancelled";
  if (row.status !== "pending") return null;

  const approvals = Array.isArray(row.approvals) ? row.approvals : [];
  const latestRound = getLatestApprovalRound(approvals);
  const hasManagerApproval = approvals.some((item) =>
    Number(item.approval_round ?? 1) === latestRound &&
    item.step === "manager_review" &&
    item.action === "approve"
  );

  return hasManagerApproval ? "finance_review" : "manager_review";
}

async function listPagedRows<T>(
  tableName: string,
  select: string,
  tenantId: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from(tableName)
      .select(select)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

export async function listLegacySubjects(
  subjectType: BackfillSubjectType,
  tenantId: string,
): Promise<LegacySubjectRow[]> {
  if (subjectType === "customer") return listCustomerSubjects(tenantId);
  if (subjectType === "project") return listProjectSubjects(tenantId);
  return listExpenseSubjects(tenantId);
}

async function listCustomerSubjects(tenantId: string) {
  const rows = await listPagedRows<{
    id: string;
    tenant_id: string;
    status: string | null;
    owner_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>("customers", "id,tenant_id,status,owner_id,created_at,updated_at", tenantId);

  return rows.map<LegacySubjectRow>((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    subject_type: "customer",
    status: row.status,
    legacy_step: null,
    actor_employee_id: row.owner_id,
    assignee_employee_id: row.owner_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    context: { owner_id: row.owner_id },
  }));
}

async function listProjectSubjects(tenantId: string) {
  const rows = await listPagedRows<{
    id: string;
    tenant_id: string;
    customer_id: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>("projects", "id,tenant_id,customer_id,status,created_at,updated_at", tenantId);

  return rows.map<LegacySubjectRow>((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    subject_type: "project",
    status: row.status,
    legacy_step: null,
    actor_employee_id: null,
    assignee_employee_id: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    context: { customer_id: row.customer_id },
  }));
}

async function listExpenseSubjects(tenantId: string) {
  const rows = await listPagedRows<{
    id: string;
    tenant_id: string;
    employee_id: string | null;
    project_id: string | null;
    status: string | null;
    assignee_id: string | null;
    total_amount: number | null;
    created_at: string | null;
    updated_at: string | null;
    approvals?: Array<{
      step: string | null;
      action: string | null;
      approval_round: number | null;
      created_at: string | null;
    }> | null;
  }>(
    "expense_requests",
    [
      "id",
      "tenant_id",
      "employee_id",
      "project_id",
      "status",
      "assignee_id",
      "total_amount",
      "created_at",
      "updated_at",
      "approvals:expense_request_approvals(step,action,approval_round,created_at)",
    ].join(","),
    tenantId,
  );

  return rows.map<LegacySubjectRow>((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    subject_type: "expense_request",
    status: row.status,
    legacy_step: resolveExpenseWorkflowStep(row),
    actor_employee_id: row.employee_id,
    assignee_employee_id: row.assignee_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    context: {
      employee_id: row.employee_id,
      project_id: row.project_id,
      total_amount: row.total_amount,
    },
  }));
}

export async function loadWorkflowBindings(tenantId: string) {
  const workflowKeys = Object.values(SUBJECT_WORKFLOW_KEY);
  const { data: definitions, error: definitionError } = await SupabaseDB.getAdminClient()
    .from("workflow_definitions")
    .select("id,workflow_key,status,active_version_id")
    .eq("tenant_id", tenantId)
    .in("workflow_key", workflowKeys);

  if (definitionError) throw definitionError;

  const activeDefinitions = ((definitions || []) as WorkflowDefinitionRow[])
    .filter((definition) =>
      definition.status === "active" && definition.active_version_id
    );
  const versionIds = activeDefinitions
    .map((definition) => definition.active_version_id)
    .filter((id): id is string => Boolean(id));

  if (versionIds.length === 0) {
    return new Map<BackfillSubjectType, WorkflowBinding>();
  }

  const { data: versions, error: versionError } = await SupabaseDB.getAdminClient()
    .from("workflow_versions")
    .select("id,definition_id,snapshot")
    .eq("tenant_id", tenantId)
    .in("id", versionIds);

  if (versionError) throw versionError;

  const versionById = new Map(
    ((versions || []) as WorkflowVersionRow[]).map((version) => [version.id, version]),
  );
  const bindings = new Map<BackfillSubjectType, WorkflowBinding>();

  for (const subjectType of Object.keys(SUBJECT_WORKFLOW_KEY) as BackfillSubjectType[]) {
    const workflowKey = SUBJECT_WORKFLOW_KEY[subjectType];
    const definition = activeDefinitions.find((item) => item.workflow_key === workflowKey);
    const version = definition?.active_version_id
      ? versionById.get(definition.active_version_id)
      : null;
    if (!definition || !version) continue;

    bindings.set(subjectType, { workflowKey, definition, version });
  }

  return bindings;
}

export async function listExistingInstances(input: {
  tenantId: string;
  definitionId: string;
  subjectType: BackfillSubjectType;
  subjectIds: string[];
}) {
  const map = new Map<string, ExistingInstanceRow[]>();
  const uniqueIds = Array.from(new Set(input.subjectIds));

  for (let index = 0; index < uniqueIds.length; index += PAGE_SIZE) {
    const batch = uniqueIds.slice(index, index + PAGE_SIZE);
    if (!batch.length) continue;

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("workflow_instances")
      .select("id,subject_id,status")
      .eq("tenant_id", input.tenantId)
      .eq("definition_id", input.definitionId)
      .eq("subject_type", input.subjectType)
      .in("subject_id", batch);

    if (error) throw error;

    for (const item of (data || []) as ExistingInstanceRow[]) {
      const rows = map.get(item.subject_id) || [];
      rows.push(item);
      map.set(item.subject_id, rows);
    }
  }

  return map;
}

function buildInstanceContext(row: LegacySubjectRow) {
  return {
    source: "state_machine_backfill",
    legacy_subject_type: row.subject_type,
    legacy_subject_id: row.id,
    legacy_status: row.status,
    legacy_step: row.legacy_step,
    legacy_created_at: row.created_at,
    legacy_updated_at: row.updated_at,
    ...(isRecord(row.context) ? row.context : {}),
  };
}

export async function createRuntimeRows(input: {
  row: LegacySubjectRow;
  binding: WorkflowBinding;
  node: SnapshotNode;
  nodeKey: string;
  instanceStatus: BackfillInstanceStatus;
}) {
  const now = new Date().toISOString();
  const startedAt = input.row.created_at || now;
  const completedAt = input.instanceStatus === "running"
    ? null
    : input.row.updated_at || now;
  const context = buildInstanceContext(input.row);
  const instanceId = await createInstance(input, context, startedAt, completedAt);
  const instanceNodeId = await createInstanceNode(
    input,
    instanceId,
    context,
    startedAt,
    completedAt,
  );
  const taskCreated = await maybeCreateTask(input, instanceId, instanceNodeId);
  await createTransitionLog(input, instanceId, context, completedAt || startedAt);
  await upsertSubjectState(input, instanceId, taskCreated);

  return { instanceId, taskCreated };
}

async function createInstance(
  input: Parameters<typeof createRuntimeRows>[0],
  context: Record<string, unknown>,
  startedAt: string,
  completedAt: string | null,
) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("workflow_instances")
    .insert({
      tenant_id: input.row.tenant_id,
      definition_id: input.binding.definition.id,
      version_id: input.binding.version.id,
      subject_type: input.row.subject_type,
      subject_id: input.row.id,
      status: input.instanceStatus,
      context,
      current_node_id: input.node.id,
      current_node_key: input.nodeKey,
      current_node_snapshot: input.node.snapshot,
      started_by: input.row.actor_employee_id,
      completed_by: input.instanceStatus === "running" ? null : input.row.actor_employee_id,
      started_at: startedAt,
      completed_at: completedAt,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String((data as { id: string }).id);
}

async function createInstanceNode(
  input: Parameters<typeof createRuntimeRows>[0],
  instanceId: string,
  context: Record<string, unknown>,
  startedAt: string,
  completedAt: string | null,
) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("workflow_instance_nodes")
    .insert({
      tenant_id: input.row.tenant_id,
      instance_id: instanceId,
      definition_id: input.binding.definition.id,
      version_id: input.binding.version.id,
      node_id: input.node.id,
      node_key: input.nodeKey,
      node_type: input.node.nodeType,
      node_snapshot: input.node.snapshot,
      status: input.instanceStatus === "running" ? "running" : input.instanceStatus,
      input: context,
      output: {},
      started_by: input.row.actor_employee_id,
      completed_by: input.instanceStatus === "running" ? null : input.row.actor_employee_id,
      started_at: startedAt,
      completed_at: completedAt,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String((data as { id: string }).id);
}

async function maybeCreateTask(
  input: Parameters<typeof createRuntimeRows>[0],
  instanceId: string,
  instanceNodeId: string,
) {
  if (!shouldCreatePendingTask(input.instanceStatus, input.node)) return false;

  const { error } = await SupabaseDB.getAdminClient()
    .from("workflow_tasks")
    .insert({
      tenant_id: input.row.tenant_id,
      instance_id: instanceId,
      instance_node_id: instanceNodeId,
      definition_id: input.binding.definition.id,
      version_id: input.binding.version.id,
      node_id: input.node.id,
      node_key: input.nodeKey,
      node_type: input.node.nodeType,
      title: input.node.title,
      status: "pending",
      assignee_employee_id: input.row.assignee_employee_id,
      assignee_permission_code: input.node.requiredPermission,
    });

  if (error) throw error;
  return true;
}

async function createTransitionLog(
  input: Parameters<typeof createRuntimeRows>[0],
  instanceId: string,
  context: Record<string, unknown>,
  createdAt: string,
) {
  const { error } = await SupabaseDB.getAdminClient()
    .from("workflow_transition_logs")
    .insert({
      tenant_id: input.row.tenant_id,
      instance_id: instanceId,
      definition_id: input.binding.definition.id,
      version_id: input.binding.version.id,
      source_node_id: null,
      source_node_key: null,
      target_node_id: input.node.id,
      target_node_key: input.nodeKey,
      action: "state_machine_backfill",
      context,
      actor_employee_id: input.row.actor_employee_id,
      created_at: createdAt,
    });

  if (error) throw error;
}

async function upsertSubjectState(
  input: Parameters<typeof createRuntimeRows>[0],
  instanceId: string,
  taskCreated: boolean,
) {
  const { error } = await SupabaseDB.getAdminClient()
    .from("workflow_subject_states")
    .upsert({
      tenant_id: input.row.tenant_id,
      subject_type: input.row.subject_type,
      subject_id: input.row.id,
      definition_id: input.binding.definition.id,
      instance_id: instanceId,
      instance_status: input.instanceStatus,
      current_node_key: input.nodeKey,
      current_node_title: input.node.title,
      current_business_kind: input.node.businessKind,
      pending_task_count: taskCreated ? 1 : 0,
    }, {
      onConflict: "tenant_id,subject_type,subject_id",
    });

  if (error) throw error;
}
